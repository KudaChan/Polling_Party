import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import { WebSocket } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

async function testInfrastructure() {
    console.log('Starting infrastructure test...');

    // Test PostgreSQL
    try {
        const pool = new Pool({
            host: 'postgres',        // Docker service name
            port: 5432,             // Internal PostgreSQL port
            user: 'poleparty',
            password: 'poleparty',
            database: 'poleparty'
        });

        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log('✅ PostgreSQL connection successful', result.rows[0]);
        client.release();
        await pool.end();
    } catch (error) {
        console.error('❌ PostgreSQL connection failed:', error);
        throw error;
    }

    // Test Kafka
    try {
        const kafka = new Kafka({
            clientId: process.env.KAFKA_CLIENT_ID || 'test-client',
            brokers: ['kafka:29092'],  // Internal Kafka broker address
        });

        const producer = kafka.producer();
        await producer.connect();
        console.log('✅ Kafka connection successful');
        
        const admin = kafka.admin();
        await admin.connect();
        const topics = await admin.listTopics();
        console.log('Available Kafka topics:', topics);
        
        await producer.disconnect();
        await admin.disconnect();
    } catch (error) {
        console.error('❌ Kafka connection failed:', error);
        throw error;
    }

    // Test WebSocket
    try {
        const ws = new WebSocket(`ws://server:3000`);  // Use internal service name
        
        await new Promise((resolve, reject) => {
            ws.on('open', () => {
                console.log('✅ WebSocket connection successful');
                ws.close();
                resolve(true);
            });
            
            ws.on('error', (error) => {
                console.error('❌ WebSocket connection failed:', error);
                reject(error);
            });

            setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, 5000);
        });
    } catch (error) {
        console.error('❌ WebSocket connection failed:', error);
        throw error;
    }

    console.log('✅ All infrastructure tests completed successfully');
}

testInfrastructure()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Infrastructure test failed:', error);
        process.exit(1);
    });
