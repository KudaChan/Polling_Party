import { pool } from '../config/database';
import { CreateVoteDTO } from '../models/vote';
import { KafkaService } from './kafkaService';
import { KAFKA_TOPICS } from '../config/kafka';

/**
 * Service handling vote operations with race condition protection
 * @class VoteService
 */
export class VoteService {
  private kafkaService: KafkaService;

  constructor(kafkaService: KafkaService) {
    this.kafkaService = kafkaService;
  }

  /**
   * Records a vote with transaction safety and publishes event
   * @param {CreateVoteDTO} voteData - Vote data including poll, option and user IDs
   * @returns {Promise<{id: string} | {error: string}>} Vote result or error
   * @throws {DatabaseError} If database operation fails
   */
  async recordVote(voteData: CreateVoteDTO): Promise<{ id: string } | { error: string }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // Check if poll is still active
      const pollStatus = await client.query(
        `SELECT expired_at FROM polls WHERE id = $1 FOR UPDATE`,
        [voteData.pollId]
      );

      if (!pollStatus.rows.length || pollStatus.rows[0].expired_at < new Date()) {
        await client.query('ROLLBACK');
        return { error: 'Poll has expired or does not exist' };
      }

      // Atomic vote insertion
      const voteResult = await client.query(
        `INSERT INTO votes (poll_id, option_id, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (poll_id, user_id) DO NOTHING
         RETURNING id`,
        [voteData.pollId, voteData.optionId, voteData.userId]
      );

      if (voteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'User has already voted on this poll' };
      }

      // Atomic counter updates with optimistic locking
      const updateResult = await client.query(
        `WITH updated_option AS (
           UPDATE poll_options 
           SET votes = votes + 1
           WHERE id = $1
           RETURNING poll_id
         )
         UPDATE polls 
         SET votes = votes + 1
         WHERE id = (SELECT poll_id FROM updated_option)
         RETURNING id`,
        [voteData.optionId]
      );

      if (!updateResult.rows.length) {
        await client.query('ROLLBACK');
        return { error: 'Failed to update vote counts' };
      }

      await client.query('COMMIT');

      // Asynchronously publish to Kafka - don't wait for it
      this.kafkaService.producerMessage(KAFKA_TOPICS.POLL_UPDATES, JSON.stringify({
        type: 'VOTE_RECORDED',
        data: voteData,
        timestamp: new Date().toISOString()
      })).catch(error => {
        console.error('Failed to publish vote event:', error);
        // Consider adding to a dead letter queue
      });

      return { id: voteResult.rows[0].id };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
