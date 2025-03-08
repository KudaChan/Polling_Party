import { withTransaction, DBQueries } from '../config/database';
import { CreateVoteDTO } from '../models/vote';
import { DatabaseError, ValidationError } from '../utils/errorHandler';

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
        throw new ValidationError('Invalid vote data');
      }

      // Check if poll has expired
      const pollResult = await client.query(
        DBQueries.isPollExpired(),
        [voteData.poll_id]
      );

      if (pollResult.rows.length === 0) {
        throw new DatabaseError('Poll has expired');
      }

      // Check if option exists in the poll
      const optionResult = await client.query(
        DBQueries.isOptionExist(),
        [voteData.poll_id, voteData.option_id]
      );
      if (optionResult.rows.length === 0) {
        throw new ValidationError('Invalid option for the poll');
      }

      // Check if user has already voted in the poll
      const existingVote = await client.query(
        DBQueries.isUserVoted(),
        [voteData.poll_id, voteData.user_id]
      );
      if (existingVote.rows.length > 0) {
        throw new ValidationError('User has already voted on this poll');
      }

      // Insert the vote
      const voteResult = await client.query(
        DBQueries.insetIntoVotes(),
        [voteData.poll_id, voteData.option_id, voteData.user_id]
      );

      // Update the vote counter
      await client.query(
        DBQueries.updateOptionVoteCount(),
        [voteData.option_id]
      );

      // Update the total vote counter
      await client.query(
        DBQueries.updateVoteCount(),
        [voteData.poll_id]
      );

      return { id: voteResult.rows[0].id };
    })
  }
}
