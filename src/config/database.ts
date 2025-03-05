/**
 * Database Configuration and Query Operations
 * This module handles all database operations for the polling system.
 */

import { ClientConfig, Client } from 'pg';
import { CreatePollDTO } from '../models/poll';
import { CreateVoteDTO } from '../models/vote';

export enum TableNames {
  POLLS = 'polls',
  OPTIONS = 'poll_options',
  VOTES = 'votes',
  VOTE_COUNTER = 'vote_counter'
}

/**
 * PostgreSQL database configuration
 * Uses environment variables with fallback values
 */
export const databaseConfig: ClientConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'poleparty',
  password: process.env.POSTGRES_PASSWORD || 'poleparty',
  database: process.env.POSTGRES_DB || 'poleparty',
};

/**
 * Executes a database query with transaction support
 * @param query - SQL query string
 * @param values - Array of values for parameterized query
 * @returns Query result
 * @throws Error if query execution fails
 */
const executeQuery = async (query: string, values: any[] = []) => {
  const client = new Client(databaseConfig);
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(query, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error:', error);
    throw new Error('Failed to execute query');
  } finally {
    await client.end();
  }
};

/**
 * Creates database tables for the polling system
 * @param tableName - Name of the table to create ('poll' or 'vote')
 * @returns Success message
 * @throws Error if table creation fails
 */
export const createTables = async (tableName: TableNames) => {
  let query: string | undefined;
  switch (tableName) {
    case TableNames.POLLS:
      query = `
        CREATE DATABASE IF NOT EXISTS ${databaseConfig.database};
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          question TEXT NOT NULL,
          options JSON NOT NULL,
          votes INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expired_at TIMESTAMP NOT NULL,
          remark TEXT DEFAULT '',
          CONSTRAINT valid_time CHECK (expired_at >= created_at)
        );
        CREATE TABLE IF NOT EXISTS ${TableNames.OPTIONS} (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          poll_id UUID NOT NULL references ${databaseConfig.database}.poll(id),
          text TEXT NOT NULL,
          votes INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT valid_time CHECK (updated_at >= created_at)
        );
      `;
      break;
    case TableNames.VOTES:
      query = `
        CREATE DATABASE IF NOT EXISTS ${databaseConfig.database};
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          poll_id UUID NOT NULL references ${databaseConfig.database}.poll(id),
          option_id UUID NOT NULL references ${databaseConfig.database}.poll_options(id),
          user_id NUMBER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT valid_time CHECK (updated_at >= created_at),
          UNIQUE(poll_id, user_id, created_at)
        );
        CREATE TABLE IF NOT EXISTS ${TableNames.VOTE_COUNTER} (
          poll_id UUID NOT NULL references ${databaseConfig.database}.poll(id),
          option_id UUID NOT NULL references ${databaseConfig.database}.poll_options(id),
          votes_count BIGINT DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT valid_time CHECK (updated_at >= created_at),
          PRIMARY KEY(poll_id, option_id)
        );
      `;
      break;
  }

  if (!query) {
    throw new Error(`Query not found for table ${tableName}`);
  }

  try {
    await executeQuery(query);
    return `Successfully created table ${tableName}`;
  } catch (error) {
    console.error('Database error:', error);
    throw new Error(`Failed to create table ${tableName}: ${error}`);
  }
};

/**
 * Inserts a new poll into the database
 * @param tableName - Name of the table (should be 'poll')
 * @param data - Poll data including question, options, and expiry
 * @returns Success message
 * @throws Error if poll insertion fails
 */
export const insertIntoPollTable = async (tableName: string = 'poll', data: CreatePollDTO) => {
  if (!data.question || !data.options || !data.expiredAt) {
    throw new Error('Invalid poll data');
  }
  // Insert poll into poll table
  const optionLength = data.options.length;

  const query = `
    INSERT INTO ${tableName} (question, options, expired_at, remark)
    VALUES ($1, $2, $3, $4)
    RETURNING id;
  `;
  const pollResult = await executeQuery(query, [
    data.question,
    JSON.stringify(data.options),
    data.expiredAt,
    data.remark
  ]);

  if (pollResult.rows.length !== 1) {
    throw new Error('Failed to insert poll in poll table: Expected 1 row to be inserted, got ' + pollResult.rows.length);
  }

  const pollID = pollResult.rows[0].id;
  // Insert poll options into poll_options table
  const optionQuery = `
    INSERT INTO ${TableNames.OPTIONS} (poll_id, text)
    SELECT $1, unnest($2::text[]);
  `;
  const optionResult = await executeQuery(optionQuery, [pollID, data.options]);

  if (optionResult.rows.length !== optionLength) {
    throw new Error('Failed to insert poll options into poll_options table: Expected ' + optionLength + ' rows to be inserted, got ' + optionResult.rows.length);
  }

  return 'Successfully inserted poll and options';
};

/**
 * Records a vote and updates all related vote counts
 * @param tableName - Name of the table (should be 'vote')
 * @param data - Vote data including pollId, optionId, and userId
 * @returns Success message
 * @throws Error if vote recording fails
 */
export const insertIntoVoteTable = async (tableName: string = 'vote', data: CreateVoteDTO) => {
  if (!data.pollId || !data.optionId || !data.userId) {
    throw new Error('Invalid vote data');
  }
  // Insert in to vote record
  const query = `
    INSERT INTO ${tableName} (poll_id, option_id, user_id)
    VALUES ($1, $2, $3)
    RETURNING id, poll_id, option_id;
  `;
  const voteResult = await executeQuery(query, [data.pollId, data.optionId, data.userId]);

  if (voteResult.rows.length !== 1) {
    throw new Error('Failed to insert vote into vote table: Expected 1 row to be inserted, got ' + voteResult.rows.length);
  }

  const { poll_id: pollId, option_id: optionId } = voteResult.rows[0];

  // Update vote counter
  const counterQuery = `
    INSERT INTO ${TableNames.VOTE_COUNTER} (poll_id, option_id, votes_count)
      VALUES ($1, $2, 1)
      ON CONFLICT (poll_id, option_id)
      DO UPDATE SET votes_count = vote_counter.votes_count + 1,
        updated_at = CURRENT_TIMESTAMP;
  `;

  const counterResult = await executeQuery(counterQuery, [pollId, optionId]);

  if (counterResult.rowCount === 0) {
    throw new Error('Failed to update vote counter into vote_counter table: Expected 1 row to be updated, got ' + counterResult.rowCount);
  };

  // Update poll vote count
  const optionVoteUpdateQuery = `
    UPDATE ${TableNames.OPTIONS}
    SET votes = votes + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE poll_id = $1 AND id = $2;
  `;

  const optionResult = await executeQuery(optionVoteUpdateQuery, [pollId, optionId]);

  if (optionResult.rowCount === 0) {
    throw new Error('Failed to update poll option in poll_options table: Expected 1 row to be updated, got ' + optionResult.rowCount);
  };

  return 'Successfully inserted vote and updated counter';
};

export const getAllPolls = async () => {
  const query = `
    SELECT id, question, options, votes, created_at, updated_at, expired_at
    FROM poll;
  `;
  const result = await executeQuery(query);
  if (result.rows.length === 0) {
    throw new Error('No polls found in the database');
  }
  return result.rows;
};

/**
 * Retrieves a specific poll by its ID
 * @param pollId - UUID of the poll
 * @returns Poll record
 * @throws Error if poll is not found
 */
export const getPollById = async (pollId: string) => {
  if (!pollId) {
    throw new Error('Invalid poll ID');
  }
  const query = `
    SELECT id, question, options, votes, created_at, updated_at, expired_at
    FROM poll
    WHERE id = $1;
  `;
  const result = await executeQuery(query, [pollId]);
  if (result.rows.length === 0) {
    throw new Error(`Poll not found with id: ${pollId}`);
  }
  return result.rows[0];
};


/**
 * Retrieves all poll results, including options and vote counts
 * @returns Array of poll results including options and vote counts sorted by vote count
 */
export const getAllPollResults = async () => {
  const query = `
  SELECT
      poll.id,
      poll.question,
      poll.votes,
      poll.created_at,
      poll.expired_at,
      poll_options.id,
      poll_options.text,
      poll_options.votes,
      poll_options.updated_at,
      vote_counter.votes_count,
      vote_counter.updated_at
    FROM ${TableNames.POLLS}
    JOIN ${TableNames.OPTIONS} ON poll.id = poll_options.poll_id
    LEFT JOIN ${TableNames.VOTE_COUNTER} ON poll_options.id = vote_counter.option_id
      AND poll.id = vote_counter.poll_id
      ORDER BY vote_counter.votes_count DESC;
  `;

  const result = await executeQuery(query);
  if (result.rows.length === 0) {
    throw new Error('No poll results found in the database');
  }
  return result.rows;
}

/**
 * Retrieves detailed results for a specific poll
 * @param pollId - UUID of the poll
 * @returns Array of poll results including options and vote counts sorted by vote count
 * @throws Error if poll is not found
 */
export const getPollResultById = async (pollId: string) => {
  if (!pollId) {
    throw new Error('Invalid poll ID');
  }
  const query = `
    SELECT
      poll.id,
      poll.question,
      poll.votes,
      poll.created_at,
      poll.expired_at,
      poll_options.id,
      poll_options.text,
      poll_options.votes,
      poll_options.updated_at,
      vote_counter.votes_count,
      vote_counter.updated_at
    FROM ${TableNames.POLLS}
    JOIN ${TableNames.OPTIONS} ON poll.id = poll_options.poll_id
    LEFT JOIN ${TableNames.VOTE_COUNTER} ON poll_options.id = vote_counter.option_id
      AND poll.id = vote_counter.poll_id
      ORDER BY vote_counter.votes_count DESC
    WHERE poll.id = $1;
  `;
  const result = await executeQuery(query, [pollId]);
  if (result.rows.length === 0) {
    throw new Error(`Poll not found with id: ${pollId}`);
  }
  return result.rows;
};
