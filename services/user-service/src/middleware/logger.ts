import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export const loggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logger.info({
      event: 'http_request',
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs
    });
  });

  next();
};
