import { DatabaseError } from "../utils/errorHandler";
import { pool } from "../config/database";
import { CreatePollDTO, Poll, PollResult } from "../models/poll";

/**
 * Service handling poll-related operations
 * @class PollService
 */
export class PollService {
  /**
   * Creates a new poll with options
   * @param {CreatePollDTO} pollData - Poll creation data
   * @returns {Promise<{id: string, optionIds: string[]}>} Created poll ID and option IDs
   * @throws {DatabaseError} If database operation fails
   */
  async createPoll(
    pollData: CreatePollDTO
  ): Promise<{ id: string; optionIds: string[] }> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Insert poll
      const pollResult = await client.query(
        `INSERT INTO polls (question, expired_at)
          VALUES ($1, $2)
          RETURNING id`,
        [pollData.question, pollData.expiredAt]
      );

      const pollId = pollResult.rows[0].id;

      // Insert options
      const optionIds: string[] = [];
      for (const optionText of pollData.options) {
        const optionResult = await client.query(
          `INSERT INTO poll_options (poll_id, text)
            VALUES ($1, $2)
            RETURNING id`,
          [pollId, optionText]
        );
        optionIds.push(optionResult.rows[0].id);
      }

      await client.query("COMMIT");

      return { id: pollId, optionIds };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves poll details including vote counts
   * @param {string} pollId - UUID of the poll
   * @returns {Promise<Poll>} Poll details with options and votes
   * @throws {DatabaseError} If database operation fails
   * @throws {ValidationError} If poll doesn't exist
   */
  async getPoll(pollId: string): Promise<Poll> {
    const result = await pool.query(
      `SELECT p.*,
              json_agg(json_build_object(
                'id', po.id,
                'text', po.text,
                'votes', po.votes
              )) as options
        FROM polls p
        LEFT JOIN poll_options po ON p.id = po.poll_id
        WHERE p.id = $1
        GROUP BY p.id`,
      [pollId]
    );

    return result.rows[0] || null;
  }

  async getPollResults(pollId: string): Promise<PollResult | null> {
    const client = await pool.connect();

    try {
      const query = `
        SELECT
          p.id,
          p.question,
          p.votes as total_votes,
          p.created_at,
          p.expired_at,
          json_agg(json_build_object(
            'id', po.id,
            'text', po.text,
            'votes', po.votes,
            'percentage', CASE
              WHEN p.votes > 0 THEN
                ROUND((po.votes::float / p.votes) * 100, 2)
              ELSE 0
            END
          )) as options
        FROM polls p
        LEFT JOIN poll_options po ON p.id = po.poll_id
        WHERE p.id = $1
        GROUP BY p.id;
      `;

      const result = await client.query(query, [pollId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        question: row.question,
        totalVotes: parseInt(row.total_votes),
        options: row.options.map((opt: any) => ({
          id: opt.id,
          text: opt.text,
          votes: parseInt(opt.votes),
          percentage: parseFloat(opt.percentage)
        })),
        createdAt: new Date(row.created_at),
        expiredAt: new Date(row.expired_at)
      };

    } catch (error) {
      throw new DatabaseError(
        `Failed to fetch poll results: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      client.release();
    }
  }

  async recordVote(voteData: { pollId: string; optionId: string; userId: string }): Promise<{ id: string }> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if poll exists
      const pollResult = await client.query(
        `SELECT * FROM polls WHERE id = $1`,
        [voteData.pollId]
      );

      if (pollResult.rows.length === 0) {
        throw new Error("Poll not found");
      }

      // Check if option exists
      const optionResult = await client.query(
        `SELECT * FROM poll_options WHERE id = $1`,
        [voteData.optionId]
      );

      if (optionResult.rows.length === 0) {
        throw new Error("Option not found");
      }

      // Insert vote record
      const voteResult = await client.query(
        `INSERT INTO votes (poll_id, option_id, user_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [voteData.pollId, voteData.optionId, voteData.userId]
      );
      const voteId = voteResult.rows[0].id;

      // Increment option votes
      await client.query(
        `UPDATE poll_options 
         SET votes = votes + 1
         WHERE id = $1`,
        [voteData.optionId]
      );

      // Increment poll votes
      await client.query(
        `UPDATE polls 
         SET votes = votes + 1
         WHERE id = $1`,
        [voteData.pollId]
      );

      await client.query("COMMIT");

      return { id: voteId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
