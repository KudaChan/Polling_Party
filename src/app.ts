import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { KafkaService, WebSocketService} from './services';
import { pollRouter } from './routes/polls';
import { leaderboardRouter } from './routes/leaderboard';
import { errorHandler, DatabaseError, KafkaError } from './utils/errorHandler';
import { pool } from './config/database';

/**
 * Main application class that initializes and configures the Express server,
 * WebSocket connections, Kafka services, and database connections.
 */
export class App {
  public app: express.Application;
  public server: ReturnType<typeof createServer>;
  private kafkaService: KafkaService;
  private websocketService: WebSocketService;

  /**
   * Initializes the application by setting up Express, HTTP server,
   * Kafka service, and WebSocket service.
   */
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.kafkaService = new KafkaService();
    this.websocketService = new WebSocketService(this.server);

    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  /**
   * Sets up Express middleware for CORS, JSON parsing, URL encoding,
   * and request logging.
   */
  private initializeMiddlewares(): void {
    this.app.use(cors({ origin: '*' }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    this.app.use((req, _res, next) => {
      console.log(`${req.method} ${req.url}`);
      next();
    });
  }

  /**
   * Configures API routes including health check endpoint,
   * poll routes, and leaderboard routes.
   */
  private initializeRoutes(): void {
    // Add health check endpoint
    this.app.get('/health', (_, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Register routes
    this.app.use('/polls', pollRouter(this.kafkaService));
    this.app.use('/leaderboard', leaderboardRouter(this.kafkaService, this.websocketService));
  }

  /**
   * Initializes WebSocket connections and sets up event handlers for
   * client connections, disconnections, errors, and messages.
   */
  private initializeWebSocket(): void {
    this.websocketService.wss.on('connection', (ws) => {
      console.log('New WebSocket client connected');

      // Send initial leaderboard data on connection
      this.kafkaService.leaderboardConsumerActivity(this.websocketService)
        .then(initialData => {
          ws.send(JSON.stringify({
            type: 'LEADERBOARD_INIT',
            data: initialData
          }));
        })
        .catch(error => {
          console.error('Error sending initial leaderboard data:', error);
        });

      // Handle client disconnection
      ws.on('close', () => {
        console.log('Client disconnected');
      });

      // Handle connection errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Optional: Handle incoming messages from clients
      ws.on('message', (message) => {
        console.log('Received message from client:', message.toString());
      });
    });
  }

  /**
   * Sets up global error handling middleware.
   */
  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  /**
   * Starts the application by connecting to the database,
   * initializing Kafka services, and starting the HTTP server.
   * @param port - The port number to listen on
   * @throws {DatabaseError} When database connection fails
   * @throws {KafkaError} When Kafka connection fails
   */
  public async start(port: number): Promise<void> {
    try {
      // Test database connection
      const client = await pool.connect();
      console.log('Database connection successful');
      client.release();

      await this.kafkaService.adminActivity();
      await this.kafkaService.consumerActivity();

      this.server.listen(port, '0.0.0.0', () => {
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

  /**
   * Sets up graceful shutdown handlers for SIGTERM and SIGINT signals.
   * Closes HTTP server, WebSocket connections, Kafka connections,
   * and database pool in order.
   */
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
