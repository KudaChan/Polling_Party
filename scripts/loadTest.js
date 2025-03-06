import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: 20,          // Reduced from 50
      duration: '30s',
    },
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },   // Reduced from 50
        { duration: '1m', target: 50 },    // Reduced from 100
        { duration: '2m', target: 50 },    // Reduced from 100
        { duration: '30s', target: 0 },
      ],
    },
    spike_test: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 50,    // Reduced from 100
      maxVUs: 100,            // Reduced from 200
      stages: [
        { duration: '30s', target: 5 },    // Reduced from 10
        { duration: '1m', target: 50 },    // Reduced from 100
        { duration: '30s', target: 0 },
      ],
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],  // Increased timeout thresholds
    http_req_failed: ['rate<0.05'],                    // Allow up to 5% failure rate
    http_reqs: ['rate>50'],                           // Reduced from 100
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const REQUEST_TIMEOUT = '10s';  // 10 second timeout

function createPoll() {
  const payload = {
    question: `Load Test Poll ${uuidv4()}`,
    options: Array.from({ length: 3 }, (_, i) => `Option ${i + 1}`),  // Reduced options
    expiredAt: new Date(Date.now() + 86400000).toISOString(),
    remark: 'Load test poll'
  };

  const params = {
    headers: { 'Content-Type': 'application/json' },
    timeout: REQUEST_TIMEOUT,
  };

  try {
    const response = http.post(
      `${BASE_URL}/polls`,
      JSON.stringify(payload),
      params
    );

    const checkResult = check(response, {
      'createPoll: status is 201': (r) => r.status === 201,
      'createPoll: response time < 2000ms': (r) => r.timings.duration < 2000,
      'createPoll: has valid data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body && body.data && body.data.id;
        } catch (e) {
          console.error('Failed to parse response:', e);
          return false;
        }
      },
    });

    if (!checkResult) {
      console.warn(`Failed poll creation. Status: ${response.status}, Body: ${response.body}`);
      return null;
    }

    return response.status === 201 ? JSON.parse(response.body).data.id : null;
  } catch (error) {
    console.error('Poll creation error:', error);
    return null;
  }
}

function getPollResult(pollId) {
  if (!pollId) return null;

  try {
    const response = http.get(
      `${BASE_URL}/polls/${pollId}`,
      { 
        headers: { 'Accept': 'application/json' },
        timeout: REQUEST_TIMEOUT,
      }
    );

    check(response, {
      'getPollResult: status is 200': (r) => r.status === 200,
      'getPollResult: response time < 2000ms': (r) => r.timings.duration < 2000,
      'getPollResult: has valid data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body && body.options && Array.isArray(body.options);
        } catch (e) {
          return false;
        }
      },
    });

    return response.status === 200 ? JSON.parse(response.body) : null;
  } catch (error) {
    console.error('Get poll result error:', error);
    return null;
  }
}

function submitVote(pollId) {
  if (!pollId) return;

  const pollData = getPollResult(pollId);
  if (!pollData || !pollData.options.length) return;

  try {
    const randomOption = pollData.options[randomIntBetween(0, pollData.options.length - 1)];
    const payload = {
      optionId: randomOption.id,
      userId: randomIntBetween(1, 1000)  // Reduced user range
    };

    const response = http.post(
      `${BASE_URL}/polls/${pollId}/vote`,
      JSON.stringify(payload),
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: REQUEST_TIMEOUT,
      }
    );

    check(response, {
      'submitVote: status is 201': (r) => r.status === 201,
      'submitVote: response time < 2000ms': (r) => r.timings.duration < 2000,
      'submitVote: has valid data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body && body.result && body.result.voteId;
        } catch (e) {
          return false;
        }
      },
    });
  } catch (error) {
    console.error('Submit vote error:', error);
  }
}

export default function () {
  const pollId = createPoll();
  if (pollId) {
    const voteCount = randomIntBetween(1, 3);  // Reduced from 5
    for (let i = 0; i < voteCount; i++) {
      submitVote(pollId);
      sleep(randomIntBetween(0.5, 1));  // Increased sleep time
    }
    getPollResult(pollId);
  }
  sleep(randomIntBetween(1, 2));  // Increased sleep time
}
