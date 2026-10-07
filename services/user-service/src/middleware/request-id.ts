import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const reqId = req.headers['x-request-id'] || uuidv4();
  req.id = reqId as string;
  res.setHeader('X-Request-ID', reqId);
  next();
};

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}
