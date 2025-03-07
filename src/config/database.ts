import { Pool, PoolClient, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import { DatabaseError } from '../utils/errorHandler';

dotenv.config();

export enum TableNames {
  POLLS = 'polls',
  OPTIONS = 'poll_options',
  VOTES = 'votes',
  VOTE_COUNTERS = 'votes_counters',
  OPTION_VOTE_COUNTERS = 'option_vote_counters'
}

export const poolConfig: PoolConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'poleparty',
  password: process.env.POSTGRES_PASSWORD || 'poleparty',
  database: process.env.POSTGRES_DB || 'poleparty',
  max: 50,
  min: 5,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
  query_timeout: 10000,
  ssl: false
};

export const pool = new Pool(poolConfig);

// Test database connection
pool.on('connect', () => {
  console.log('Database pool connected');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

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

export const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createTables = async () => {
  const client = await pool.connect();
  const queries = `
    CREATE TABLE IF NOT EXISTS ${TableNames.POLLS} (
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
      );
  `;
  try {
    await client.query('BEGIN');
    await client.query(queries);
    await client.query('COMMIT');
    console.log('Database tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new DatabaseError(`Failed to create tables: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    client.release();
  }
};
