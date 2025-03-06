import { pool } from "../config/database";
import { DatabaseError } from "../utils/errorHandler";
import { KafkaService } from "./kafkaService";
import { WebSocketService } from "./websocketService";
import { KAFKA_TOPICS } from "../config/kafka";

interface TopPollOption {
  pollId: string;
  pollQuestion: string;
  optionId: string;
  optionText: string;
  votes: number;
  percentage: number;
  rank: number;
}

/**
 * Service handling leaderboard operations and real-time updates
 * @class LeaderboardService
 */
export class LeaderboardService {
  private kafkaService: KafkaService;
  private websocketService: WebSocketService;
  private readonly CACHE_TTL = 10000; // 10 seconds cache
  private leaderboardCache: { data: TopPollOption[]; timestamp: number } | null = null;

  constructor(kafkaService: KafkaService, websocketService: WebSocketService) {
    this.kafkaService = kafkaService;
    this.websocketService = websocketService;
    this.initializeKafkaConsumer();
  }

  private async initializeKafkaConsumer(): Promise<void> {
    await this.kafkaService.subscribeAndRun(KAFKA_TOPICS.POLL_UPDATES, async (message) => {
      if (message.type === 'VOTE_RECORDED') {
        await this.updateLeaderboard();
      }
    });
  }

  private async updateLeaderboard(): Promise<void> {
    const leaderboard = await this.getTopOptions();
    this.websocketService.broadcast({
      type: 'LEADERBOARD_UPDATE',
      data: leaderboard
    });
  }

  /**
   * Retrieves top voted options across all active polls
   * @param {number} limit - Maximum number of results to return
   * @returns {Promise<TopPollOption[]>} Ranked list of poll options
   * @throws {DatabaseError} If database operation fails
   */
  async getTopOptions(limit: number = 10): Promise<TopPollOption[]> {
    // Check cache
    if (this.leaderboardCache &&
        Date.now() - this.leaderboardCache.timestamp < this.CACHE_TTL) {
      return this.leaderboardCache.data;
    }

    const client = await pool.connect();

    try {
      const query = `
        WITH RankedOptions AS (
          SELECT
            p.id as poll_id,
            p.question as poll_question,
            po.id as option_id,
            po.text as option_text,
            po.votes,
            CASE
              WHEN p.votes > 0 THEN
                ROUND((po.votes::float / p.votes) * 100, 2)
              ELSE 0
            END as percentage,
            DENSE_RANK() OVER (ORDER BY po.votes DESC) as rank
          FROM polls p
          JOIN poll_options po ON p.id = po.poll_id
          WHERE p.expired_at > NOW()
          AND po.votes > 0
        )
        SELECT *
        FROM RankedOptions
        WHERE rank <= $1
        ORDER BY votes DESC, percentage DESC;
      `;

      const result = await client.query(query, [limit]);

      const leaderboard = result.rows.map(row => ({
        pollId: row.poll_id,
        pollQuestion: row.poll_question,
        optionId: row.option_id,
        optionText: row.option_text,
        votes: parseInt(row.votes),
        percentage: parseFloat(row.percentage),
        rank: parseInt(row.rank)
      }));

      // Update cache
      this.leaderboardCache = {
        data: leaderboard,
        timestamp: Date.now()
      };

      return leaderboard;

    } catch (error) {
      throw new DatabaseError(
        `Failed to fetch top options: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      client.release();
    }
  }

  async getPollRanking(pollId: string): Promise<{ rank: number; totalPolls: number }> {
    const client = await pool.connect();

    try {
      const query = `
        WITH PollRanks AS (
          SELECT
            id,
            votes,
            DENSE_RANK() OVER (ORDER BY votes DESC) as rank
          FROM polls
          WHERE votes > 0 AND expired_at > NOW()
        )
        SELECT
          rank,
          COUNT(*) OVER() as total_polls
        FROM PollRanks
        WHERE id = $1;
      `;

      const result = await client.query(query, [pollId]);

      if (result.rows.length === 0) {
        throw new DatabaseError('Poll not found or has no votes');
      }

      return {
        rank: result.rows[0].rank,
        totalPolls: result.rows[0].total_polls
      };
    } catch (error) {
      throw new DatabaseError(
        `Failed to fetch poll ranking: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      client.release();
    }
  }
}
