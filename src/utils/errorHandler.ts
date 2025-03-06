import { Request, Response, NextFunction } from 'express';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class WebSocketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebSocketError';
  }
}

export class KafkaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KafkaError';
  }
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errorResponse: ErrorResponse = {
    error: error.name,
    message: error.message
  };

  // Log error with request context
  console.error('Error details:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    timestamp: new Date().toISOString()
  });

  // Handle specific error types
  switch (true) {
    case error instanceof ValidationError:
      res.status(400).json({
        ...errorResponse,
        error: 'Validation Error'
      });
      break;

    case error instanceof DatabaseError:
      res.status(503).json({
        ...errorResponse,
        error: 'Database Error'
      });
      break;

    case error instanceof WebSocketError:
      res.status(500).json({
        ...errorResponse,
        error: 'WebSocket Error'
      });
      break;

    case error instanceof KafkaError:
      res.status(503).json({
        ...errorResponse,
        error: 'Message Queue Error'
      });
      break;

    case error instanceof SyntaxError && 'body' in error:
      res.status(400).json({
        error: 'Invalid JSON',
        message: 'Invalid request body format'
      });
      break;

    case error instanceof TypeError:
      res.status(400).json({
        ...errorResponse,
        error: 'Type Error',
        message: 'Invalid data type in request'
      });
      break;

    case error.name === 'UnauthorizedError':
      res.status(401).json({
        ...errorResponse,
        error: 'Authentication Error'
      });
      break;

    case error.name === 'ForbiddenError':
      res.status(403).json({
        ...errorResponse,
        error: 'Authorization Error'
      });
      break;

    default:
      // Handle unknown errors
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' 
          ? 'An unexpected error occurred' 
          : error.message
      });
  }

  // If headers have already been sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }
};

// Helper function to wrap async route handlers
export const asyncHandler = (fn: Function) => (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};
