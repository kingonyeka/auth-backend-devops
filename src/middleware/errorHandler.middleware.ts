import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,

  next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
      requestId: req.requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    logger.warn({ err, requestId: req.requestId }, err.message);
    res.status(err.statusCode).json({ error: err.message, requestId: req.requestId });
    return;
  }

  // Anything else is unexpected — log the full error, never leak internals to the client.
  logger.error({ err, requestId: req.requestId }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error', requestId: req.requestId });
}
