import { Kafka } from 'kafkajs';

export const kafkaConfig = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'polling-app',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:29092').split(','),
  retry: {
    initialRetryTime: 1000,
    retries: 10,
  },
});
