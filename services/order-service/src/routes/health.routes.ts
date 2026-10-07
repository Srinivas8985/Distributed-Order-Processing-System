import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { checkRabbitMQConnection } from '../lib/rabbitmq';
import { logger } from '../lib/logger';

export const healthRouter = Router();

healthRouter.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'order-service'
  });
});

healthRouter.get('/ready', async (req: Request, res: Response) => {
  let dbStatus = 'up';
  let rabbitmqStatus = 'up';
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

  try {
    const isRabbitConnected = await checkRabbitMQConnection();
    if (!isRabbitConnected) throw new Error('RabbitMQ disconnected');
  } catch (err: any) {
    logger.error({ event: 'readiness_check_failed', dependency: 'rabbitmq', message: err.message });
    rabbitmqStatus = 'down';
    status = 'not_ready';
    httpStatus = 503;
  }

  res.status(httpStatus).json({
    status,
    dependencies: {
      database: dbStatus,
      rabbitmq: rabbitmqStatus
    }
  });
});
