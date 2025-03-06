import { Router, Request, Response } from 'express';
import { PollService } from '../services/pollService';
import { ValidationError, asyncHandler } from '../utils/errorHandler';

export const pollRouter = (pollService: PollService): Router => {
  const router = Router();

  // Create Poll API: POST /polls
  router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const { question, options, expiredAt } = req.body;

    if (!question || !options || !expiredAt) {
      throw new ValidationError('Missing required fields: question, options, or expiredAt');
    }

    if (!Array.isArray(options) || options.length < 2) {
      throw new ValidationError('Options must be an array with at least 2 items');
    }

    const expirationDate = new Date(expiredAt);
    if (isNaN(expirationDate.getTime()) || expirationDate <= new Date()) {
      throw new ValidationError('Invalid or past expiration date');
    }

    const result = await pollService.createPoll({ question, options, expiredAt: expirationDate });
    res.status(201).json(result);
  }));

  // Poll Results API: GET /polls/{id}
  router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Poll ID is required');
    }

    const results = await pollService.getPollResults(id);
    if (!results) {
      throw new ValidationError('Poll not found');
    }

    res.json(results);
  }));

  // Vote API: POST /polls/{id}/vote
  router.post('/:id/vote', asyncHandler(async (req: Request, res: Response) => {
    const pollId = req.params.id;
    const { optionId, userId } = req.body;

    if (!optionId || !userId) {
      throw new ValidationError('Required fields missing: optionId and userId are required');
    }

    const result = await pollService.recordVote({ pollId, optionId, userId });
    res.status(201).json(result);
  }));

  return router;
};
