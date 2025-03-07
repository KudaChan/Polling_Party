# Polling System

A high-concurrency polling system built with Node.js, TypeScript, Kafka, and PostgreSQL. The system supports real-time updates via WebSocket and includes a leaderboard feature.

## Project Structure

```
├── src/
│   ├── config/
│   │   ├── database.ts     # Database configuration and connection pool
│   │   └── kafka.ts        # Kafka configuration and topic definitions
│   ├── services/
│   │   ├── index.ts        # Service exports
│   │   ├── kafkaService.ts # Kafka producer/consumer handling
│   │   ├── pollService.ts  # Poll creation and management
│   │   ├── voteService.ts  # Vote processing and validation
│   │   ├── leaderboardService.ts # Real-time leaderboard updates
│   │   └── websocketService.ts   # WebSocket connection handling
│   ├── routes/
│   │   ├── polls.ts        # Poll-related API endpoints
│   │   └── leaderboard.ts  # Leaderboard API endpoints
│   ├── utils/
│   │   └── errorHandler.ts # Custom error handling
│   ├── app.ts             # Express application setup
│   └── index.ts           # Application entry point
├── docker-compose.yml     # Container orchestration
├── Dockerfile            # Node.js application container
├── package.json          # Project dependencies
└── tsconfig.json         # TypeScript configuration
```

## Key Components

### API Routes

1.`/polls`: Create and manage polls

- Body:

  ```json
  {
    "question": "What is your favorite programming language?",
    "options": ["JavaScript", "Python", "Java", "Go", "Rust"],
    "expired_at": "2025-03-30T00:00:00.000Z"
  }
  ```

2.`/polls/:id`: Retrieve poll results

- Body:

  ```json
  {
    "user_id": "user123",
    "option_id": "7331a5fe-f289-4e89-8c92-521fd58b733d"
  }
  ```

3.`/polls/:id/vote`: Cast votes

- Body:

  ```json
  {
    "user_id": "user123",
    "option_id": "7331a5fe-f289-4e89-8c92-521fd58b733d"
  }
  ```

4.`/leaderboard`: Retrieve real-time leaderboard data

### Configuration Files

1.`docker-compose.yml`

- Defines services: Node.js server, Kafka, Zookeeper, PostgreSQL
- Configures networking, volumes, and health checks
- Sets environment variables and service dependencies

2.`src/config/database.ts`

- PostgreSQL connection pool configuration
- Database table definitions
- Connection parameters and optimization settings

3.`src/config/kafka.ts`

- Kafka client configuration
- Topic definitions
- Connection retry logic

### Core Services

1.`src/services/pollService.ts`

- Poll creation and management
- Poll expiration handling
- Poll retrieval and updates

2.`src/services/voteService.ts`

- Vote processing with race condition prevention
- Transaction management
- Vote validation and counting

3.`src/services/leaderboardService.ts`

- Real-time leaderboard calculations
- Caching implementation
- WebSocket updates

4.`src/services/websocketService.ts`

- WebSocket connection management
- Real-time updates broadcasting
- Connection error handling

## Setup and Deployment

### Prerequisites

- Docker and Docker Compose
- Node.js 18+
- PostgreSQL 14+
- Kafka 2.8+

### Environment Variables

```env
NODE_ENV=production
PORT=3000
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=poleparty
POSTGRES_PASSWORD=poleparty
POSTGRES_DB=poleparty
KAFKA_BROKERS=kafka:29092
KAFKA_CLIENT_ID=polling-app
KAFKA_GROUP_ID=polling-group
```

### Running the Application

1.Development:

```bash
npm install
npm run dev
```

2.Production:

```bash
docker-compose up -d
```

## Architecture Highlights

- **High Concurrency Support**: Optimized database connections and Kafka integration
- **Real-time Updates**: WebSocket implementation for live poll results
- **Data Integrity**: Transaction
