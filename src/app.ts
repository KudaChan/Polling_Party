import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { KafkaService, LeaderboardService, PollService, VoteService, WebSocketService } from './services';
import { pollRouter } from './routes/polls';
import { leaderboardRouter } from './routes/leaderboard';
import { errorHandler, WebSocketError, DatabaseError, KafkaError } from './utils/errorHandler';
import { pool } from './config/database';

export class App {
  public app: express.Application;
  public server: ReturnType<typeof createServer>;
  private pollService: PollService;
  private voteService: VoteService;
  private kafkaService: KafkaService;
  private websocketService: WebSocketService;
  private leaderboardService: LeaderboardService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.kafkaService = new KafkaService();
    this.websocketService = new WebSocketService(this.server);
    this.pollService = new PollService();
    this.voteService = new VoteService(this.kafkaService);
    this.leaderboardService = new LeaderboardService(
      this.kafkaService,
      this.websocketService
    );

    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    this.app.use(cors({ origin: '*' }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    this.app.use((req) => {
      console.log(`${req.method} ${req.url}`);
    });
  }

  private initializeRoutes(): void {
    this.app.use('/polls', pollRouter(this.pollService));
    this.app.use('/leaderboard', leaderboardRouter(this.leaderboardService));
  }

  private initializeWebSocket(): void {
    this.websocketService.onMessage(async (ws, message) => {
      try {
        const data = JSON.parse(message.toString());
        const { pollId, optionId, userId } = data;

        if (!pollId || !optionId || !userId) {
          throw new WebSocketError('Missing required fields: pollId, optionId, or userId');
        }

        const result = await this.voteService.recordVote({ pollId, optionId, userId });

        if ('error' in result) {
          ws.send(JSON.stringify({
            status: 'error',
            message: result.error
          }));
          return;
        }

        ws.send(JSON.stringify({ status: 'success', data: result }));
      } catch (error) {
        console.error('WebSocket error:', error);
        ws.send(JSON.stringify({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        }));
      }
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(port: number): Promise<void> {
    try {
      // Test database connection
      const client = await pool.connect();
      console.log('Database connection successful');
      client.release();

      // Connect to Kafka
      await this.kafkaService.ensureProducerConnection();
      console.log('Kafka producer connection successful');

      this.server.listen(port, () => {
        console.log(`Server is running on port ${port}`);
      });

      this.setupGracefulShutdown();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('database')) {
          throw new DatabaseError(`Failed to connect to database: ${error.message}`);
        } else if (error.message.includes('kafka')) {
          throw new KafkaError(`Failed to connect to Kafka: ${error.message}`);
        }
      }
      throw error;
    }
  }

  private async setupGracefulShutdown(): Promise<void> {
    const shutdown = async () => {
      console.log('Shutting down gracefully...');

      try {
        // Close server first (stop accepting new connections)
        await new Promise((resolve) => {
          this.server.close(() => {
            console.log('HTTP server closed');
            resolve(true);
          });
        });

        // Close WebSocket connections
        await this.websocketService.close();
        console.log('WebSocket server closed');

        // Disconnect Kafka
        await this.kafkaService.disconnect();
        console.log('Kafka connections closed');

        // Close database pool
        await pool.end();
        console.log('Database connections closed');

        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}
