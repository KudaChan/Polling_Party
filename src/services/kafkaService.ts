import { Kafka, Producer, Consumer, EachMessagePayload, KafkaMessage } from 'kafkajs';
import { kafkaConfig } from '../config/kafka';
import { CreateVoteDTO } from '../models/vote';

export class KafkaService {
  private kafka!: Kafka;
  private producer!: Producer;
  private consumer!: Consumer;

  constructor() {
    this.kafka = kafkaConfig;
    this.producer = this.kafka.producer({
      retry: {
        initialRetryTime: 1000,
        retries: 10,
      },
    });
    this.consumer = this.kafka.consumer({
      groupId: process.env.KAFKA_GROUP_ID || 'polling-group',
      retry: {
        initialRetryTime: 1000,
        retries: 10,
      },
    });
  }

  async connectWithKafkaConsumer(retry: number = 5, interval: number = 5000): Promise<void> {
    for (let i = 0; i < retry; i++) {
      try {
        await this.consumer.connect();
        console.log('Successfully connected to Kafka');
        return;
      } catch (error) {
        console.error('Error connecting to Kafka:', error);
        if (i < retry - 1) {
          console.log(`Retrying in ${interval / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }
    }
    throw new Error('Failed to connect to Kafka after multiple retries');
  }

  async connectWithKafkaProducer(retry: number = 5, interval: number = 5000): Promise<void> {
    for (let i = 0; i < retry; i++) {
      try {
        await this.producer.connect();
        console.log('Successfully connected to Kafka');
        return;
      } catch (error) {
        console.error('Error connecting to Kafka:', error);
        if (i < retry - 1) {
          console.log(`Retrying in ${interval / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }
    }
    throw new Error('Failed to connect to Kafka after multiple retries');
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
    console.log('Producer disconnected');
    await this.consumer.disconnect();
    console.log('Consumer disconnected');
  }

  async producerMessage(topic: string, message: string): Promise<void> {
    try {
      await this.connectWithKafkaProducer();
      await this.producer.send({
        topic,
        messages: [{ value: message }],
      });
      console.log(`Message sent to ${topic}: ${message}`);
    } catch (error) {
      console.error(`Error sending message to ${topic}: ${error}`);
      throw error;
    }
  }

  async subscribeAndRun(topic: string, onMessage: (message: KafkaMessage) => Promise<void>): Promise<void> {
    try {
      await this.connectWithKafkaConsumer();
      await this.consumer.subscribe({ topic, fromBeginning: true });
      this.consumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          await onMessage(message);
        },
      });
      console.log(`Subscribed to ${topic}`);
    } catch (error) {
      console.error(`Error subscribing or running consumer for topic ${topic}:`, error);
      throw error;
    }
  }
}
