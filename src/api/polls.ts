import express, { NextFunction, Request, Response, Router } from 'express';
import { CreatePollDTO } from '../models/poll';
import { CreateVoteDTO } from '../models/vote';
import { VoteService, PollService } from '../services';

const router: Router = express.Router();

// POST /polls - Create a new poll
export const configureCreatePollRoute = (pollService: PollService): Router => {
  router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const { question, options, expiredAt, remark } = req.body;

      if (!question || !options || !options.length || !expiredAt) {
        return res.status(400).json({ error: 'Invalid poll data: question, options, and expiredAt are required' });
      }

      const pollData: CreatePollDTO = { question, options, expiredAt, remark };
      const result = await pollService.createPoll(pollData);

      res.status(201).json({ message: 'Poll created successfully', result });
    } catch (error) {
      next(error);
    }
  });
  return router;
};

// POST /polls/:id/votes - Add a vote to a poll
export const configureVoteRoute = (voteService: VoteService): Router => {
  const voteRouter = express.Router(); // Create a separate router for votes
  voteRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const { optionId, userId } = req.body;
      const pollId = req.params.id;

      if (!pollId || !optionId || !userId) {
        return res.status(400).json({ error: 'Missing required fields: pollId, optionId, userId' });
      }

      const voteData: CreateVoteDTO = { pollId, optionId, userId };

      const result = await voteService.recordVote(voteData);

      res.status(201).json({ message: 'Vote created successfully', result });
    } catch (error) {
      next(error);
    }
  });
  return voteRouter;
};

// GET /polls/:id - Get a poll's results
export const configurePollRoute = (pollService: PollService): Router => {
  const pollRouter = express.Router();// Create a separate router for poll results
  pollRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const pollId = req.params.id;
      if (!pollId) {
        return res.status(400).json({ error: 'Missing required field: pollId' });
      }

      const poll = await pollService.getPollResult(pollId);
      res.status(200).json(poll);
    } catch (error) {
      next(error);
    }
  });
  return pollRouter;
};

export default router;
