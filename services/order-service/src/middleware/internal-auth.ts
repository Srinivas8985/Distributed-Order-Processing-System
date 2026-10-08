import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export const internalAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('X-Service-Auth');

  if (!token || token !== config.INTERNAL_SERVICE_TOKEN) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid internal service token' });
  }

  next();
};
