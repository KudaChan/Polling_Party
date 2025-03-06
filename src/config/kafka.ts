import { Kafka } from 'kafkajs';
import dotenv from 'dotenv';

dotenv.config();

export const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'polling-app',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

export const KAFKA_TOPICS = {
  POLL_UPDATES: 'polling-updates'
};