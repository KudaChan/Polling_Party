import { createTables } from './src/config/database';
import { App } from './src/app';

async function bootstrap() {
  try {
    // Create and initialize tables
    await createTables();
    console.log('Database tables initialized');

    // Initialize the application
    const app = new App();
    const port = parseInt(process.env.PORT || '3000', 10);

    // Start the application
    await app.start(port);
    console.log(`Server is running at http://localhost:${port}`);

  } catch (error) {
    console.error('Failed to start application:', error);
    // Ensure we exit with a non-zero code on startup failure
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
bootstrap().catch((error) => {
  console.error('Bootstrap error:', error);
  process.exit(1);
});
