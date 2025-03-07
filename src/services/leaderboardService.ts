import { withTransaction, TableNames } from '../config/database';
import { LeaderboardResult } from '../models/poll';

export class LeaderboardService {

  async getLeaderboard(): Promise<LeaderboardResult> {
    return withTransaction(async (client) => {
      const query = `
        SELECT
          p.id as poll_id,
          p.question as poll_question,
          o.id as option_id,
          o.option_text,
          COALESCE(ovc.vote_count, 0) as vote_count
        FROM ${TableNames.POLLS} p
        JOIN ${TableNames.OPTIONS} o ON p.id = o.poll_id
        LEFT JOIN ${TableNames.OPTION_VOTE_COUNTERS} ovc ON o.id = ovc.option_id
        WHERE p.expired_at > NOW()
        ORDER BY ovc.vote_count DESC NULLS LAST
        LIMIT 10;
      `;

      const result = await client.query(query);
      return {
        data: result.rows.map(row => ({
          poll_id: row.poll_id,
          poll_question: row.poll_question,
          option_id: row.option_id,
          option_text: row.option_text,
          vote_count: parseInt(row.vote_count)
        })),
        timestamp: new Date().toISOString()
      };
    });
  }

}
