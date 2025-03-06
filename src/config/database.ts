import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import { DatabaseError } from '../utils/errorHandler';

dotenv.config();

export enum TableNames {
  POLLS = 'polls',
  OPTIONS = 'poll_options',
  VOTES = 'votes'
}

export const poolConfig: PoolConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5050'),
  user: process.env.POSTGRES_USER || 'poleparty',
  password: process.env.POSTGRES_PASSWORD || 'poleparty',
  database: process.env.POSTGRES_DB || 'poleparty',
  max: 100,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 5000,
  query_timeout: 5000,
  // Remove SSL configuration since local Postgres doesn't have SSL enabled
  ssl: false
};

export const pool = new Pool(poolConfig);

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

export const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create polls table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TableNames.POLLS} (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        question TEXT NOT NULL,
        expired_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        votes INTEGER DEFAULT 0
      );
    `);

    // Create poll options table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TableNames.OPTIONS} (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        poll_id UUID REFERENCES ${TableNames.POLLS}(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        votes INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create votes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TableNames.VOTES} (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        poll_id UUID REFERENCES ${TableNames.POLLS}(id) ON DELETE CASCADE,
        option_id UUID REFERENCES ${TableNames.OPTIONS}(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(poll_id, user_id)
      );
    `);

    // Add unique constraint to prevent duplicate votes
    await client.query(`
      ALTER TABLE ${TableNames.VOTES}
      ADD CONSTRAINT unique_user_poll_vote
      UNIQUE (poll_id, user_id);
    `);

    // Add indexes for frequently queried columns
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_votes_poll_id ON ${TableNames.VOTES} (poll_id);
      CREATE INDEX IF NOT EXISTS idx_votes_user_id ON ${TableNames.VOTES} (user_id);
      CREATE INDEX IF NOT EXISTS idx_poll_options_poll_id ON ${TableNames.OPTIONS} (poll_id);
      CREATE INDEX IF NOT EXISTS idx_polls_expired_at ON ${TableNames.POLLS} (expired_at);
    `);

    await client.query('COMMIT');
    console.log('Database tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new DatabaseError(`Failed to create tables: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    client.release();
  }
};
