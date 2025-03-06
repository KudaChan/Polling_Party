import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { poolConfig, TableNames } from '../src/config/database';
import fs from 'fs';
import path from 'path';

const TOTAL_POLLS = 50;
const OPTIONS_PER_POLL = 4;
const VOTES_PER_POLL = 100;

interface TestData {
  polls: Array<{
    id: string;
    question: string;
    expiredAt: string;
    options: Array<{
      id: string;
      text: string;
      votes: number;
    }>;
  }>;
}

const pool = new Pool(poolConfig);

async function generateTestData() {
  const client = await pool.connect();
  const testData: TestData = { polls: [] };

  try {
    console.log('Connecting to database...');
    await client.query('BEGIN');

    console.log(`Generating ${TOTAL_POLLS} polls...`);

    for (let i = 0; i < TOTAL_POLLS; i++) {
      const pollId = uuidv4();
      const question = `Test Poll ${i + 1}: What is your favorite ${['color', 'food', 'movie', 'book', 'place'][i % 5]}?`;
      const expiryDate = new Date(Date.now() + (Math.random() * 7 + 1) * 86400000); // 1-8 days from now

      // Insert poll
      await client.query(`
        INSERT INTO ${TableNames.POLLS} (id, question, expired_at)
        VALUES ($1, $2, $3)
      `, [pollId, question, expiryDate]);

      const pollOptions : Array<{
        id: string;
        text: string;
        votes: number;
      }> = [];

      // Generate options
      for (let j = 0; j < OPTIONS_PER_POLL; j++) {
        const optionId = uuidv4();
        const optionText = `Option ${j + 1}`;

        await client.query(`
          INSERT INTO ${TableNames.OPTIONS} (id, poll_id, text)
          VALUES ($1, $2, $3)
        `, [optionId, pollId, optionText]);

        pollOptions.push({ id: optionId, text: optionText, votes: 0 });
      }

      // Generate random votes
      const votedUsers = new Set<string>();
      let successfulVotes = 0;

      while (successfulVotes < VOTES_PER_POLL) {
        const randomOption = pollOptions[Math.floor(Math.random() * pollOptions.length)];
        const userId = `user_${Math.floor(Math.random() * 1000) + 1}`;

        if (votedUsers.has(userId)) {
          continue;
        }

        try {
          await client.query(`
            INSERT INTO ${TableNames.VOTES} (poll_id, option_id, user_id)
            VALUES ($1, $2, $3)
          `, [pollId, randomOption.id, userId]);

          await client.query(`
            UPDATE ${TableNames.OPTIONS}
            SET votes = votes + 1
            WHERE id = $1
          `, [randomOption.id]);

          await client.query(`
            UPDATE ${TableNames.POLLS}
            SET votes = votes + 1
            WHERE id = $1
          `, [pollId]);

          randomOption.votes++;
          votedUsers.add(userId);
          successfulVotes++;
        } catch (error: any) {
          // Skip any errors and continue
          continue;
        }
      }

      testData.polls.push({
        id: pollId,
        question,
        expiredAt: expiryDate.toISOString(),
        options: pollOptions
      });

      console.log(`Generated poll ${i + 1}/${TOTAL_POLLS} with ${VOTES_PER_POLL} votes`);
    }

    await client.query('COMMIT');

    // Save test data to file
    const testDataPath = path.join(__dirname, 'testData.json');
    fs.writeFileSync(testDataPath, JSON.stringify(testData, null, 2));
    console.log(`Test data saved to ${testDataPath}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generating test data:', error);
    throw error;
  } finally {
    client.release();
  }
}

generateTestData().catch(console.error);
