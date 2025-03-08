import { withTransaction, DBQueries } from '../config/database';
import { CreatePollDTO, PollResult } from '../models/poll';
import { DatabaseError, ValidationError } from '../utils/errorHandler';

/**
 * Service handling poll-related operations including creation and result retrieval
 * @class PollService
 */
export class PollService {
  /**
   * Creates a new poll with options and initializes vote counters
   * @param {CreatePollDTO} pollData - Poll creation data containing question, options and expiration date
   * @returns {Promise<{id: string, optionIds: string[]}>} Created poll ID and array of option IDs
   * @throws {Error} If poll data is invalid
   * @throws {Error} If poll expiration date is invalid
   * @throws {Error} If poll with same question already exists
   * @throws {Error} If poll creation fails
   * @throws {Error} If option creation fails
   */
  async createPoll(
    pollData: CreatePollDTO
  ): Promise<{ id: string; optionIds: string[] }> {
    return withTransaction(async client => {
      // Check if poll creation data is valid
      if (!pollData.question || !pollData.options || pollData.options.length < 2) {
        throw new ValidationError('Invalid poll data');
      }

      // Check if poll expiration date is valid
      if (!pollData.expired_at || pollData.expired_at <= new Date()) {
        throw new ValidationError('Invalid poll expiration date');
      }

      // Check if poll already exists with the same question and options
      const existingPoll = await client.query(
        DBQueries.isPollExist(),
        [pollData.question]
      );
      if (existingPoll.rows.length > 0) {
        throw new DatabaseError('Poll already exists');
      }

      // Insert poll
      const pollResult = await client.query(
        DBQueries.insetIntoPoll(),
        [pollData.question, pollData.expired_at]
      );

      const pollId = pollResult.rows[0].id;

      // Check if poll creation was successful
      if (!pollId) {
        throw new DatabaseError('Failed to create poll');
      }

      // Insert options
      const optionIds: string[] = [];
      for (const optionText of pollData.options) {
        const optionResult = await client.query(
          DBQueries.insetIntoOptions(),
          [pollId, optionText]
        );
        optionIds.push(optionResult.rows[0].id);
      }

      // Check if option creation was successful
      if (optionIds.length !== pollData.options.length) {
        throw new DatabaseError('Failed to create options');
      }

      // Update vote counters table
      await client.query(
        DBQueries.insertPollIntoVoteCounter(),
        [pollId]
      );
      await client.query(
        DBQueries.insertOptionIntoOptionVoteCounter(),
        [pollId]
      );

      return { id: pollId, optionIds };
    });
  }

  /**
   * Retrieves poll results including vote counts for each option
   * @param {string} pollId - Unique identifier of the poll
   * @returns {Promise<PollResult>} Poll details including question, options, vote counts and timestamps
   * @throws {Error} If poll ID is invalid
   * @throws {Error} If poll does not exist
   * @throws {Error} If fetching poll results fails
   */
  async getPollResults(pollId: string): Promise<PollResult> {
    return withTransaction(async client => {
      // Check if requested id is valid
      if (!pollId) {
        throw new ValidationError('Invalid poll ID');
      }

      // Check if poll exists
      const pollExists = await client.query(
        DBQueries.isPollExitWithId(),
        [pollId]
      );
      if (pollExists.rows.length === 0) {
        throw new DatabaseError('Poll does not exist');
      }

      // Fetch poll results
      const query = DBQueries.getPollResultWithUnions();

      const result = await client.query(query, [pollId]);

      if (result.rows.length === 0) {
        throw new DatabaseError('Failed to fetch poll results');
      }

      const row = result.rows[0];
      return {
        id: row.id,
        question: row.question,
        total_votes: parseInt(row.total_votes),
        options: row.options.map((opt: any) => ({
          option_id: opt.option_id,
          option_text: opt.option_text,
          vote_count: parseInt(opt.vote_count)
        })),
        created_at: new Date(row.created_at),
        expired_at: new Date(row.expired_at)
      };
    });
  }
}
