import { Pool, PoolClient, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import { DatabaseError } from '../utils/errorHandler';

dotenv.config();

/**
 * Enum for database table names to ensure consistency across the application
 */
export enum TableNames {
  POLLS = 'polls',
  OPTIONS = 'poll_options',
  VOTES = 'votes',
  VOTE_COUNTERS = 'votes_counters',
  OPTION_VOTE_COUNTERS = 'option_vote_counters'
}

/**
 * PostgreSQL connection pool configuration
 * Uses environment variables with fallback values
 */
export const poolConfig: PoolConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'poleparty',
  password: process.env.POSTGRES_PASSWORD || 'poleparty',
  database: process.env.POSTGRES_DB || 'poleparty',
  max: 50,                              // Maximum number of clients in the pool
  min: 5,                               // Minimum number of idle clients to maintain
  idleTimeoutMillis: 5000,              // Time a client can remain idle before being closed
  connectionTimeoutMillis: 5000,        // Time to wait for a connection
  statement_timeout: 10000,             // Maximum time for statement execution
  query_timeout: 10000,                 // Maximum time for query execution
  ssl: false                            // SSL connection setting
};

/**
 * Create and export the connection pool instance
 */
export const pool = new Pool(poolConfig);

// Test database connection
pool.on('connect', () => {
  console.log('Database pool connected');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

/**
 * Executes a database query with retry logic
 * @param query - SQL query string
 * @param values - Array of values to be used in the query
 * @param retries - Number of retry attempts (default: 3)
 * @returns Query result
 * @throws DatabaseError if all retry attempts fail
 */
export const executeQuery = async (query: string, values: any[] = [], retries = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = await pool.connect();
    try {
      const result = await client.query(query, values);
      return result;
    } catch (error: any) {
      lastError = error;
      console.error(`Database query attempt ${attempt} failed:`, error.message);
      if (attempt === retries) {
        throw new DatabaseError(`Query failed after ${retries} attempts: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    } finally {
      client.release();
    }
  }
  throw lastError;
};

/**
 * Executes a callback function within a database transaction
 * Automatically handles COMMIT and ROLLBACK
 * @param callback - Function to execute within the transaction
 * @returns Result of the callback function
 * @throws DatabaseError if transaction fails
 */
export const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw new DatabaseError(error);
  } finally {
    client.release();
  }
};

/**
 * Creates database tables if they don't exist
 * Sets up the schema for polls, options, votes, and vote counters
 * @throws DatabaseError if table creation fails
 */
export const createTables = () => {
  withTransaction(() => {
    return executeQuery(DBQueries.createTables());
  });
};

/**
 * Class containing SQL queries for database operations
 */
export class DBQueries {
  // Creates tables if they don't exist
  static createTables() {
    return ` CREATE TABLE IF NOT EXISTS ${TableNames.POLLS} (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      question TEXT NOT NULL,
      expired_at TIMESTAMP WITH TIME ZONE NOT NULL,
      remarks TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ${TableNames.OPTIONS} (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      poll_id UUID REFERENCES ${TableNames.POLLS}(id) ON DELETE CASCADE,
      option_text TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ${TableNames.VOTES} (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      poll_id UUID REFERENCES ${TableNames.POLLS}(id) ON DELETE CASCADE,
      user_id VARCHAR(255) NOT NULL,
      option_id UUID REFERENCES ${TableNames.OPTIONS}(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(poll_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS ${TableNames.VOTE_COUNTERS} (
      poll_id UUID PRIMARY KEY REFERENCES ${TableNames.POLLS}(id) ON DELETE CASCADE,
      vote_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ${TableNames.OPTION_VOTE_COUNTERS} (
      option_id UUID PRIMARY KEY REFERENCES ${TableNames.OPTIONS}(id) ON DELETE CASCADE,
      vote_count INTEGER DEFAULT 0
    ); `;
  }

  // Queries for creating poll data
  static insetIntoPoll() {
    return `INSERT INTO ${TableNames.POLLS} (question, expired_at) VALUES ($1, $2) RETURNING id`;
  };

  // Queries for validating poll data
  static isPollExist() {
    return `SELECT id FROM ${TableNames.POLLS} WHERE question = $1`;
  };

  // Queries for validating poll data
  static isPollExitWithId() {
    return `SELECT id FROM ${TableNames.POLLS} WHERE id = $1`;
  };

  // Queries for validating poll data
  static isPollExpired() {
    return `SELECT id FROM ${TableNames.POLLS} WHERE id = $1 AND expired_at > NOW()`;
  };

  // Queries for creating option data
  static insetIntoOptions() {
    return `INSERT INTO ${TableNames.OPTIONS} (poll_id, option_text) VALUES ($1, $2) RETURNING id`;
  };

  // Queries for validating option data
  static isOptionExist() {
    return `SELECT id FROM ${TableNames.OPTIONS} WHERE poll_id = $1 AND id = $2`;
  };

  // Queries for validating user vote
  static isUserVoted() {
    return `SELECT id FROM ${TableNames.VOTES} WHERE poll_id = $1 AND user_id = $2`;
  };

  // Queries for creating vote data
  static insetIntoVotes() {
    return `INSERT INTO ${TableNames.VOTES} (poll_id, option_id, user_id) VALUES ($1, $2, $3) RETURNING id`;
  };

  // Queries for updating vote counters
  static insertPollIntoVoteCounter() {
    return `INSERT INTO ${TableNames.VOTE_COUNTERS} (poll_id) VALUES ($1)`;
  };

  // Queries for updating vote counters
  static insertOptionIntoOptionVoteCounter() {
    return `INSERT INTO ${TableNames.OPTION_VOTE_COUNTERS} (option_id) SELECT id FROM ${TableNames.OPTIONS} WHERE poll_id = $1`;
  };

  // Queries for updating vote counters
  static updateVoteCount() {
    return `UPDATE ${TableNames.VOTE_COUNTERS} SET vote_count = vote_count + 1 WHERE poll_id = $1`;
  };

  // Queries for updating vote counters
  static updateOptionVoteCount() {
    return `UPDATE ${TableNames.OPTION_VOTE_COUNTERS} SET vote_count = vote_count + 1 WHERE option_id = $1`;
  };

  // Queries for getting poll data
  static getPollResultWithUnions() {
    return `
    SELECT
      p.id,
      p.question,
      vc.vote_count as total_votes,
      json_agg(
        json_build_object(
          'option_id', po.id,
          'option_text', po.option_text,
          'vote_count', ovc.vote_count
        )
      ) as options,
      p.created_at,
      p.expired_at
      FROM ${TableNames.POLLS} p
      LEFT JOIN ${TableNames.OPTIONS} po ON p.id = po.poll_id
      LEFT JOIN ${TableNames.OPTION_VOTE_COUNTERS} ovc ON po.id = ovc.option_id
      LEFT JOIN ${TableNames.VOTE_COUNTERS} vc ON p.id = vc.poll_id
      WHERE p.id = $1
      GROUP BY p.id, vc.vote_count;
    `;
  }
}