import { TableNames } from '../src/config/database';
import { Pool } from 'pg';
import * as kleur from 'kleur';

async function monitorDatabase() {
  // Create a new pool with Docker Compose settings
  const pool = new Pool({
    host: 'postgres',        // Docker service name
    port: 5432,             // Internal PostgreSQL port
    user: 'poleparty',
    password: 'poleparty',
    database: 'poleparty'
  });

  const client = await pool.connect();

  try {
    while (true) {
      console.clear();

      // Poll Statistics
      const pollStats = await client.query(`
        SELECT 
          COUNT(*) as total_polls,
          SUM(COALESCE(votes, 0)) as total_votes,
          MAX(COALESCE(votes, 0)) as max_votes,
          COALESCE(AVG(votes), 0)::numeric(10,2) as avg_votes,
          COUNT(CASE WHEN expired_at < NOW() THEN 1 END) as expired_polls
        FROM ${TableNames.POLLS}
      `);

      console.log(kleur.blue().bold('\n=== Poll Statistics ==='));
      console.table(pollStats.rows[0]);

      // Active Polls (Top 5 by votes)
      const activePolls = await client.query(`
        SELECT 
          p.id,
          p.question,
          COALESCE(p.votes, 0) as total_votes,
          COUNT(DISTINCT v.user_id) as unique_voters,
          MAX(v.created_at) as last_vote_time,
          EXTRACT(epoch FROM NOW() - COALESCE(MAX(v.created_at), NOW()))::integer as seconds_since_last_vote,
          p.expired_at,
          CASE WHEN p.expired_at < NOW() THEN 'Expired' ELSE 'Active' END as status
        FROM ${TableNames.POLLS} p
        LEFT JOIN ${TableNames.VOTES} v ON p.id = v.poll_id
        WHERE p.expired_at > NOW()
        GROUP BY p.id, p.question, p.votes, p.expired_at
        ORDER BY p.votes DESC NULLS LAST
        LIMIT 5
      `);

      console.log(kleur.green().bold('\n=== Top 5 Active Polls ==='));
      console.table(activePolls.rows);

      // Vote Statistics
      const voteStats = await client.query(`
        SELECT 
          COUNT(*) as total_votes,
          COUNT(DISTINCT user_id) as unique_voters,
          COUNT(DISTINCT poll_id) as polls_with_votes,
          MAX(created_at) as last_vote_time,
          EXTRACT(epoch FROM NOW() - COALESCE(MAX(created_at), NOW()))::integer as seconds_since_last_vote
        FROM ${TableNames.VOTES}
      `);

      console.log(kleur.yellow().bold('\n=== Vote Statistics ==='));
      console.table(voteStats.rows[0]);

      // Performance Metrics
      const performanceStats = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM ${TableNames.VOTES} 
           WHERE created_at > NOW() - INTERVAL '1 minute') as votes_last_minute,
          (SELECT COUNT(*) FROM ${TableNames.VOTES} 
           WHERE created_at > NOW() - INTERVAL '5 minutes') as votes_last_5_minutes,
          (SELECT COUNT(*) FROM ${TableNames.VOTES} 
           WHERE created_at > NOW() - INTERVAL '1 hour') as votes_last_hour
      `);

      console.log(kleur.magenta().bold('\n=== Performance Metrics ==='));
      console.table(performanceStats.rows[0]);

      // Wait 5 seconds before next update
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } catch (error) {
    console.error('Monitoring error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nGracefully shutting down...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nGracefully shutting down...');
  process.exit(0);
});

// Start monitoring
console.log('Starting database monitor...');
monitorDatabase().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
