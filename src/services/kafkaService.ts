import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';

export class KafkaService {
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private isProducerConnected: boolean = false;
  private isConsumerConnected: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID || 'polling-app',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ 
      groupId: process.env.KAFKA_GROUP_ID || 'polling-group'
    });
  }

  async ensureProducerConnection() {
    if (!this.isProducerConnected) {
      await this.producer.connect();
      this.isProducerConnected = true;
    }
  }

  async ensureConsumerConnection() {
    if (!this.isConsumerConnected) {
      await this.consumer.connect();
      this.isConsumerConnected = true;
    }
  }

  async producerMessage(topic: string, message: string): Promise<void> {
    await this.ensureProducerConnection();
    await this.producer.send({
      topic,
      messages: [{ value: message }],
    });
  }

  async subscribeAndRun(topic: string, onMessage: (message: any) => Promise<void>): Promise<void> {
    await this.ensureConsumerConnection();
    await this.consumer.subscribe({ topic, fromBeginning: true });
    
    await this.consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        try {
          const value = message.value?.toString();
          if (value) {
            await onMessage(JSON.parse(value));
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      },
    });
  }

  async disconnect(): Promise<void> {
    if (this.isProducerConnected) {
      await this.producer.disconnect();
      this.isProducerConnected = false;
    }
    if (this.isConsumerConnected) {
      await this.consumer.disconnect();
      this.isConsumerConnected = false;
    }
  }
}
