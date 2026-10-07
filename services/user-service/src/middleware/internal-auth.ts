import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export const internalAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('X-Service-Auth');

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing service authentication token',
        retryable: false
      },
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }

  if (token !== config.INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid service authentication token',
        retryable: false
      },
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }

  next();
};
