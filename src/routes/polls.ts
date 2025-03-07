import { Router, Request, Response } from 'express';
import { ValidationError, asyncHandler } from '../utils/errorHandler';
import { KafkaService, PollService } from '../services';
import { CreatePollDTO } from '../models/poll';
import { CreateVoteDTO } from '../models/vote';

/**
 * Creates and configures the poll router
 * @param kafkaService - Service for handling Kafka messaging operations
 * @returns Express Router configured with poll endpoints
 */
export const pollRouter = (kafkaService: KafkaService): Router => {
  const router = Router();

  /**
   * Health check endpoint
   * @route GET /health
   * @returns {Object} Status object with timestamp
   */
  router.get('/health', (_, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  /**
   * Creates a new poll
   * @route POST /polls
   * @param {Object} req.body - Poll creation request body
   * @param {string} req.body.question - Poll question
   * @param {string[]} req.body.options - Array of poll options
   * @param {string} req.body.expired_at - Poll expiration date
   * @throws {ValidationError} If request data is invalid
   * @returns {Promise<Object>} Created poll data
   */
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

  /**
   * Retrieves poll results
   * @route GET /polls/:id
   * @param {string} req.params.id - Poll ID
   * @throws {ValidationError} If poll ID is missing
   * @returns {Promise<Object>} Poll results including options and vote counts
   */
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

  /**
   * Records a vote for a poll option
   * @route POST /polls/:id/vote
   * @param {string} req.params.id - Poll ID
   * @param {Object} req.body - Vote data
   * @param {string} req.body.option_id - Selected option ID
   * @param {string} req.body.user_id - Voting user ID
   * @throws {ValidationError} If required parameters are missing
   * @returns {Promise<Object>} Vote confirmation
   */
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
