import { Kafka, Admin, Producer, Consumer, Partitioners } from 'kafkajs';
import dotenv from 'dotenv';
import { CreatePollDTO, LeaderboardResult } from '../models/poll';
import { CreateVoteDTO } from '../models/vote';
import { PollService } from './pollService';
import { VoteService } from './voteService';
import { WebSocketService } from './websocketService';
import { LeaderboardService } from './leaderboardService';

dotenv.config();

/**
 * Service for managing Kafka messaging operations including poll creation and voting
 */
export class KafkaService {
  private kafka: Kafka;
  private admin: Admin;
  private pollProducer: Producer;
  private voteProducer: Producer;
  private consumer: Consumer;
  private leaderboardConsumer: Consumer;

  /**
   * Initializes Kafka clients with configuration from environment variables
   */
  constructor() {
    this.kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID || 'polling-app',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    this.admin = this.kafka.admin({
      retry: {
        initialRetryTime: 1000,
        retries: 10
      }
    }
    );

    this.pollProducer = this.kafka.producer({
      allowAutoTopicCreation: false,
      transactionTimeout: 30000,
      createPartitioner: Partitioners.LegacyPartitioner,
      retry: {
        initialRetryTime: 1000,
        retries: 5
      }
    });

    this.voteProducer = this.kafka.producer({
      allowAutoTopicCreation: false,
      transactionTimeout: 30000,
      createPartitioner: Partitioners.LegacyPartitioner,
      retry: {
        initialRetryTime: 1000,
        retries: 5
      }
    });

    this.consumer = this.kafka.consumer({
      groupId: 'create-consumer-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 500,
      retry: {
        initialRetryTime: 1000,
        retries: 5
      }
    });

    this.leaderboardConsumer = this.kafka.consumer({
      groupId: 'result-consumer-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 500,
      retry: {
        initialRetryTime: 1000,
        retries: 5
      }
    });
  }

  /**
   * Connects to Kafka admin client and ensures required topics exist
   * @throws {Error} If connection or topic creation fails
   */
  async adminActivity(): Promise<void> {
    await this.admin.connect().then(() => {
      console.log('Kafka admin connection successful');
    }).catch(error => {
      console.error('Failed to connect to Kafka admin:', error);
    });

    try {
      const topics: string[] | undefined | null = await this.admin.listTopics();
      console.log('Available Kafka topics:', topics);

      if (!topics || !topics.includes('polling-updates')) {
        await this.admin.createTopics({
          topics: [
            {
              topic: 'polling-updates',
              numPartitions: 2
            }
          ]
        }).then(() => {
          console.log('Created Kafka topic: polling-updates');
        }).catch(error => {
          console.error('Failed to create Kafka topic: polling-updates', error);
        });

        await this.admin.fetchTopicMetadata({
          topics: ['polling-updates']
        }).then(metadata => {
          console.log('Metadata for polling-updates:', metadata);
        }).catch(error => {
          console.error('Failed to fetch metadata for polling-updates:', error);
        });
      }
    } catch (error) {
      console.error('Failed to list Kafka topics:', error);
    } finally {
      await this.admin.disconnect().then(() => {
        console.log('Kafka admin disconnected');
      }).catch(error => {
        console.error('Failed to disconnect Kafka admin:', error);
      });
    }
  }

  /**
   * Produces poll creation messages to Kafka
   * @param data - Poll creation data
   * @throws {Error} If producer connection or message sending fails
   */
  async pollProducerActivity(data: CreatePollDTO): Promise<void> {
    await this.pollProducer.connect().then(() => {
      console.log('Kafka poll producer connection successful');
    }).catch(error => {
      console.error('Failed to connect to Kafka poll producer:', error);
    });

    const expiredAt = data.expired_at instanceof Date
      ? data.expired_at.toISOString()
      : data.expired_at;

    const message = JSON.stringify({
      question: data.question,
      options: data.options,
      expired_at: expiredAt
    });

    await this.pollProducer.send({
      topic: 'polling-updates',
      messages: [
        {
          value: message,
          partition: 0
        }
      ]
    }).then(() => {
      console.log('Sent message to Kafka topic: polling-updates');
    }).catch(error => {
      console.error('Failed to send message to Kafka topic: polling-updates', error);
    });
  }

  /**
   * Produces vote messages to Kafka
   * @param data - Vote data
   * @throws {Error} If producer connection or message sending fails
   */
  async voteProducerActivity(data: CreateVoteDTO): Promise<void> {
    await this.voteProducer.connect().then(() => {
      console.log('Kafka vote producer connection successful');
    }).catch(error => {
      console.error('Failed to connect to Kafka vote producer:', error);
    });

    const message = JSON.stringify({
      poll_id: data.poll_id,
      option_id: data.option_id,
      user_id: data.user_id
    });

    await this.voteProducer.send({
      topic: 'polling-updates',
      messages: [
        {
          value: message,
          partition: 1
        }
      ]
    }).then(() => {
      console.log('Sent message to Kafka topic: polling-updates');
    }).catch(error => {
      console.error('Failed to send message to Kafka topic: polling-updates', error);
    });
  }

  /**
   * Consumes messages from Kafka and processes poll creation and voting
   * @throws {Error} If consumer connection, subscription, or message processing fails
   */
  async consumerActivity(): Promise<void> {
    await this.consumer.connect().then(() => {
      console.log('Kafka consumer connection successful');
    }).catch(error => {
      console.error('Failed to connect to Kafka consumer:', error);
    });

    await this.consumer.subscribe({
      topic: 'polling-updates',
      fromBeginning: true
    }).then(() => {
      console.log('Subscribed to Kafka topic: polling-updates');
    }).catch(error => {
      console.error('Failed to subscribe to Kafka topic: polling-updates', error);
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (message.value === null) {
          console.log(`Received null message from ${topic}`);
          return;
        }

        if (partition === 0) {
          const pollData = JSON.parse(message.value.toString('utf-8'));
          console.log(`Processing poll creation from partition ${partition}`);
          const pollService = new PollService();
          try {
            const result = await pollService.createPoll(pollData);
            console.log('Poll created successfully:', result);
          } catch (error) {
            console.error('Failed to create poll:', error);
          }
        } else if (partition === 1) {
          const voteData = JSON.parse(message.value.toString('utf-8'));
          console.log(`Processing vote from partition ${partition}`);
          const voteService = new VoteService();
          try {
            const result = await voteService.recordVote(voteData);
            console.log('Vote recorded successfully:', result);
          } catch (error) {
            console.error('Failed to record vote:', error);
          }
        } else {
          console.warn(`Received message from unexpected partition ${partition}`);
        }
      }
    }).catch(error => {
      console.error('Failed to run Kafka consumer:', error);
    });
  }

  /**
   * Consumes vote messages and updates leaderboard via WebSocket
   * @param wss - WebSocket service instance
   * @returns Initial leaderboard data
   * @throws {Error} If consumer connection, subscription, or message processing fails
   */
  async leaderboardConsumerActivity(wss: WebSocketService): Promise<LeaderboardResult> {
    const leaderboardService = new LeaderboardService();
    const result = await leaderboardService.getLeaderboard();

    await this.leaderboardConsumer.subscribe({
      topic: 'polling-updates',
      fromBeginning: true
    }).then(() => {
      console.log('Subscribed to Kafka topic: polling-updates');
    }).catch(error => {
      console.error('Failed to subscribe to Kafka topic: polling-updates', error);
    });

    await this.leaderboardConsumer.run({
      eachMessage: async ({ partition, message }) => {
        if (message.value === null) return;

        if (partition === 1) {
          const updatedLeaderboard = await leaderboardService.getLeaderboard();
          wss.sendLeaderboardUpdate(updatedLeaderboard);
        }
      }
    }).then(() => {
      console.log('Leaderboard consumer started');
    }).catch(error => {
      console.error('Failed to run leaderboard consumer:', error);
    });

    return result;
  }

  /**
   * Disconnects all Kafka clients
   * @throws {Error} If disconnection fails
   */
  async disconnect(): Promise<void> {
    try {
      if (this.pollProducer) {
        await this.pollProducer.disconnect();
        console.log('Poll producer disconnected');
      }

      if (this.voteProducer) {
        await this.voteProducer.disconnect();
        console.log('Vote producer disconnected');
      }

      if (this.consumer) {
        await this.consumer.disconnect();
        console.log('Consumer disconnected');
      }
    } catch (error) {
      console.error('Error disconnecting Kafka clients:', error);
    }
  }
}
