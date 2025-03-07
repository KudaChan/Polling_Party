import { Router, Request, Response } from 'express';
import { KafkaService, WebSocketService } from '../services';
import { asyncHandler } from '../utils/errorHandler';

export const leaderboardRouter = (kafkaService: KafkaService, wss: WebSocketService): Router => {
  const router = Router();

  // Health check endpoint
  router.get('/health', (_, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Leaderboard API: GET /leaderboard
  router.get('/', asyncHandler(async (_: Request, res: Response) => {
    const result = await kafkaService.leaderboardConsumerActivity(wss);
    res.json(result);
  }));

  return router;
};
