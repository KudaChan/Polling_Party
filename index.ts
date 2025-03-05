import express from 'express';
import { Client } from 'pg';
import { createServer } from 'http';
import { databaseConfig } from './src/config';
import { KafkaService, PollService, VoteService, LeaderboardService } from './src/services';
import { WebSocketService } from './src/services/websocketService';
import { createTables, TableNames } from './src/config/database';
import { CreateVoteDTO } from './src/models/vote';
import pollsRouter, { configureVoteRoute, configurePollRoute, configureCreatePollRoute } from './src/api/polls';
import { configureLeaderboardRoute } from './src/api/leaderboard';
import { errorHandler } from './src/utils/errorHandler';

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

// WebSocket Server setup
const websocketServiceClient = new WebSocketService(server);

// PostgreSQL setup
const pgClient = new Client(databaseConfig);

// Service Clients
const kafkaServiceClient = new KafkaService();
const pollServiceClient = new PollService();
const voteServiceClient = new VoteService(kafkaServiceClient);
const leaderboardServiceClient = new LeaderboardService();

// Middleware
app.use(express.json());
app.use(errorHandler);

// Routes
const createPollRoutes = configureCreatePollRoute(pollServiceClient); // POST /polls
const voteRoutes = configureVoteRoute(voteServiceClient); // POST /polls/:id/votes
const pollResultRoutes = configurePollRoute(pollServiceClient); // GET /polls/:id
const leaderboardRoutes = configureLeaderboardRoute(leaderboardServiceClient); // GET /leaderboard
// Mount Routes
app.use('/polls', createPollRoutes);
app.use('/polls/:id', pollResultRoutes);
app.use('/polls/:id/votes', voteRoutes);
app.use('/leaderboard', leaderboardRoutes);

websocketServiceClient.onMessage(async (ws, message) => {
  try {
    const data = JSON.parse(message.toString());
    const { pollId, optionId, userId } = data;
    console.log(`Received pollId: ${pollId}, optionId: ${optionId}, userId: ${userId}`);
    const vote: CreateVoteDTO = { pollId, optionId, userId };
    await voteServiceClient.recordVote(vote);
    ws.send(JSON.stringify({ status: 'success' }));
  } catch (error) {
    console.error('Error parsing message:', error);
    ws.send(JSON.stringify({ status: 'error', message: 'Invalid message format' }));
  }
});

// Initialize services
async function initialize() {
  try {
    // Connect to PostgreSQL
    await pgClient.connect();
    console.log('Connected to PostgreSQL');
    // Create tables
    await createTables(TableNames.POLLS);
    await createTables(TableNames.VOTES);

    // Connect to Kafka
    await kafkaServiceClient.connectWithKafkaProducer();
    await kafkaServiceClient.connectWithKafkaConsumer();

    // Subscribe to Kafka topic
    await kafkaServiceClient.subscribeAndRun('polling-updates', async (message) => {
      const value = message.value!.toString();
      if (value) {
        const { pollId } = JSON.parse(value);
        const pollResult = await pollServiceClient.getPollResult(pollId);
        const leaderboard = await leaderboardServiceClient.getLeaderboard();
        websocketServiceClient.broadcast(JSON.stringify(pollResult));
        websocketServiceClient.broadcast(JSON.stringify(leaderboard));
      }
    });
    // Start the server
    server.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (error) {
    console.error('Error initializing services:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  websocketServiceClient.close();
  await kafkaServiceClient.disconnect();
  await pgClient.end();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

initialize().catch(console.error);
