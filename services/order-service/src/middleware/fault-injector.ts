import { Request, Response, NextFunction } from 'express';
import { faultEngine } from '../lib/fault-engine';

export const faultInjector = (targetComponent: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await faultEngine.evaluateFaultsByComponent(targetComponent, req.headers['x-request-id'] as string);
      next();
    } catch (error: any) {
      if (error.message.includes('[SIMULATED_FAULT]')) {
        if (error.message.includes('unavailable')) {
          return res.status(503).json({ error: 'Service Unavailable', simulated: true });
        }
        return res.status(500).json({ error: 'Internal Server Error', simulated: true });
      }
      next(error);
    }
  };
};
