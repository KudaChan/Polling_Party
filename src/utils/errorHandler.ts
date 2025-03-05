import { Request, Response, NextFunction } from 'express';

export const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error Handler: ', error);

  if (error instanceof Error) {
    res.status(500).json({ error: 'An internal error occurred: ' + error.message });
  } else {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}