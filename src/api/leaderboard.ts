import express, { Request, Response, Router } from 'express';
import { LeaderboardService } from '../services/leaderboardService';

const router: Router = express.Router();

// GET /leaderboard - Get the leaderboard
export const configureLeaderboardRoute = (leaderboardService: LeaderboardService): Router => {
  router.get('/', async (req: Request, res: Response): Promise<any> => {
    try {
      const leaderboard = await leaderboardService.getLeaderboard();
      res.json(leaderboard);
    } catch (err) {
      console.error('Error getting leaderboard', err);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });
  return router;
};

export default router;