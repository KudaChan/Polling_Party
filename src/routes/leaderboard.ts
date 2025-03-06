import { Router, Request, Response } from 'express';
import { LeaderboardService } from '../services/leaderboardService';
import { ValidationError, asyncHandler } from '../utils/errorHandler';

export const leaderboardRouter = (leaderboardService: LeaderboardService): Router => {
  const router = Router();

  // Leaderboard API: GET /leaderboard
  router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    
    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Invalid limit parameter. Must be between 1 and 100');
    }
    
    const leaderboard = await leaderboardService.getTopOptions(limit);
    res.json({
      status: 'success',
      data: leaderboard,
      timestamp: new Date().toISOString()
    });
  }));

  return router;
};
