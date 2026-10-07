import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { ZodError } from 'zod';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.status || err.statusCode || 500;
  
  if (err instanceof ZodError) {
    const issues = err.issues || (err as any).errors;
    logger.warn({ event: 'validation_error', requestId: req.id, errors: issues });
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      requestId: req.id,
      details: issues
    });
  }

  if (statusCode >= 500) {
    logger.error({ event: 'internal_error', requestId: req.id, message: err.message, stack: err.stack });
  } else {
    logger.warn({ event: 'client_error', requestId: req.id, message: err.message, statusCode });
  }

  res.status(statusCode).json({
    error: err.code || 'INTERNAL_ERROR',
    message: statusCode === 500 ? 'Internal server error' : err.message,
    requestId: req.id
  });
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Resource not found',
    requestId: req.id
  });
};
