import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export const healthRouter = Router();

healthRouter.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'user-service'
  });
});

healthRouter.get('/ready', async (req: Request, res: Response) => {
  let dbStatus = 'up';
  let status = 'ready';
  let httpStatus = 200;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err: any) {
    logger.error({ event: 'readiness_check_failed', dependency: 'database', message: err.message });
    dbStatus = 'down';
    status = 'not_ready';
    httpStatus = 503;
  }

  res.status(httpStatus).json({
    status,
    dependencies: {
      database: dbStatus
    }
  });
});
