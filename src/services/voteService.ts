import { withTransaction, TableNames } from '../config/database';
import { CreateVoteDTO } from '../models/vote';

/**
 * Service handling vote operations
 * @class VoteService
 */
export class VoteService {

  /**
   * Records a vote with transaction safety
   * @param {CreateVoteDTO} voteData - Vote data including poll, option and user IDs
   * @returns {Promise<{id: string}>} Vote result
   * @throws {Error} If vote recording fails
   * @throws {Error} If vote data is invalid
   * @throws {Error} If poll has expired
   * @throws {Error} If option does not exist in the poll
   * @throws {Error} If user has already voted in the poll
   */
  async recordVote(voteData: CreateVoteDTO): Promise<{ id: string }> {
    return withTransaction(async (client) => {
      // Validate input data
      if (!voteData.poll_id || !voteData.option_id || !voteData.user_id) {
        throw new Error('Invalid vote data');
      }

      // Check if poll has expired
      const pollResult = await client.query(
        `SELECT expired_at FROM ${TableNames.POLLS} WHERE id = $1`,
        [voteData.poll_id]
      );
      if (pollResult.rows.length === 0 || pollResult.rows[0].expired_at <= new Date()) {
        throw new Error('Poll has expired');
      }

      // Check if option exists in the poll
      const optionResult = await client.query(
        `SELECT id FROM ${TableNames.OPTIONS} WHERE poll_id = $1 AND id = $2`,
        [voteData.poll_id, voteData.option_id]
      );
      if (optionResult.rows.length === 0) {
        throw new Error('Invalid option for the poll');
      }

      // Check if user has already voted in the poll
      const existingVote = await client.query(
        `SELECT id FROM ${TableNames.VOTES} WHERE poll_id = $1 AND user_id = $2`,
        [voteData.poll_id, voteData.user_id]
      );
      if (existingVote.rows.length > 0) {
        throw new Error('User has already voted on this poll');
      }

      // Insert the vote
      const voteResult = await client.query(
        `INSERT INTO ${TableNames.VOTES} (poll_id, option_id, user_id) VALUES ($1, $2, $3) RETURNING id`,
        [voteData.poll_id, voteData.option_id, voteData.user_id]
      );

      // Update the vote counter
      await client.query(
        `UPDATE ${TableNames.OPTION_VOTE_COUNTERS} SET vote_count = vote_count + 1 WHERE option_id = $1`,
        [voteData.option_id]
      );

      // Update the total vote counter
      await client.query(
        `UPDATE ${TableNames.VOTE_COUNTERS} SET vote_count = vote_count + 1 WHERE poll_id = $1`,
        [voteData.poll_id]
      );

      return { id: voteResult.rows[0].id };
    })
  }
}
