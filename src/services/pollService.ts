import { withTransaction, TableNames } from '../config/database';
import { CreatePollDTO, PollResult } from '../models/poll';

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
        throw new Error('Invalid poll data');
      }

      // Check if poll expiration date is valid
      if (!pollData.expired_at || pollData.expired_at <= new Date()) {
        throw new Error('Invalid poll expiration date');
      }

      // Check if poll already exists with the same question and options
      const existingPoll = await client.query(
        `SELECT id FROM ${TableNames.POLLS} WHERE question = $1`,
        [pollData.question]
      );
      if (existingPoll.rows.length > 0) {
        throw new Error('Poll already exists');
      }

      // Insert poll
      const pollResult = await client.query(
        `INSERT INTO ${TableNames.POLLS} (question, expired_at)
          VALUES ($1, $2)
          RETURNING id;`,
        [pollData.question, pollData.expired_at]
      );

      const pollId = pollResult.rows[0].id;

      // Check if poll creation was successful
      if (!pollId) {
        throw new Error('Failed to create poll');
      }

      // Insert options
      const optionIds: string[] = [];
      for (const optionText of pollData.options) {
        const optionResult = await client.query(
          `INSERT INTO ${TableNames.OPTIONS} (poll_id, option_text)
            VALUES ($1, $2)
            RETURNING id;`,
          [pollId, optionText]
        );
        optionIds.push(optionResult.rows[0].id);
      }

      // Check if option creation was successful
      if (optionIds.length !== pollData.options.length) {
        throw new Error('Failed to create options');
      }

      // Update vote counters table
      await client.query(
        `INSERT INTO ${TableNames.VOTE_COUNTERS} (poll_id) VALUES ($1)`,
        [pollId]
      );
      await client.query(
        `INSERT INTO ${TableNames.OPTION_VOTE_COUNTERS} (option_id) SELECT id FROM ${TableNames.OPTIONS} WHERE poll_id = $1`,
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
        throw new Error('Invalid poll ID');
      }

      // Check if poll exists
      const pollExists = await client.query(
        `SELECT id FROM ${TableNames.POLLS} WHERE id = $1`,
        [pollId]
      );
      if (pollExists.rows.length === 0) {
        throw new Error('Poll does not exist');
      }

      // Fetch poll results
      const query = `
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

      const result = await client.query(query, [pollId]);

      if (result.rows.length === 0) {
        throw new Error('Failed to fetch poll results');
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
