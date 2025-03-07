import { Router, Request, Response } from 'express';
import { ValidationError, asyncHandler } from '../utils/errorHandler';
import { KafkaService, PollService } from '../services';
import { CreatePollDTO } from '../models/poll';
import { CreateVoteDTO } from '../models/vote';

export const pollRouter = (kafkaService: KafkaService): Router => {
  const router = Router();

  router.get('/health', (_, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Create Poll API: POST /polls
  router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const { question, options, expired_at } = req.body;

    // Validate required fields
    if (!question || !options || !expired_at) {
      throw new ValidationError('Missing required fields: question, options, expired_at');
    }

    // Validate question
    if (typeof question !== 'string' || question.trim().length === 0) {
      throw new ValidationError('Question must be a non-empty string');
    }

    // Validate options
    if (!Array.isArray(options) || options.length < 2) {
      throw new ValidationError('Options must be an array with at least 2 items');
    }

    if (!options.every(opt => typeof opt === 'string' && opt.trim().length > 0)) {
      throw new ValidationError('All options must be non-empty strings');
    }

    // Validate and parse expired_at
    let expiredAtDate: Date;
    try {
      expiredAtDate = new Date(expired_at);
      if (isNaN(expiredAtDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      throw new ValidationError('expired_at must be a valid date string');
    }

    const pollData: CreatePollDTO = {
      question: question.trim(),
      options: options.map(opt => opt.trim()),
      expired_at: expiredAtDate
    };

    const result = await kafkaService.pollProducerActivity(pollData);
    res.status(201).json(result);
  }));

  // Poll Results API: GET /polls/{id}
  router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Poll ID is required');
    }

    const pollService = new PollService();

    await pollService.getPollResults(id).then(result => {
      res.json(result);
    });
  }));

  // Vote API: POST /polls/{id}/vote
  router.post('/:id/vote', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const voteData: CreateVoteDTO = req.body;

    if (!id || !voteData.option_id || !voteData.user_id) {
      throw new ValidationError('Poll ID, option ID, and user ID are required');
    }

    await kafkaService.voteProducerActivity({ ...voteData, poll_id: id }).then((result) => {
      res.json(result);
    });
  }));

  return router;
};
