import app from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { connectRabbitMQ, closeRabbitMQ } from './lib/rabbitmq';
import { outboxWorker } from './workers/outbox.worker';

const server = app.listen(config.PORT, async () => {
  try {
    logger.info({ event: 'server_start', port: config.PORT, environment: config.NODE_ENV });
    await prisma.$connect();
    logger.info({ event: 'db_connected', message: 'Connected to Order Database' });
    await connectRabbitMQ();
    outboxWorker.start();
  } catch (err: any) {
    logger.fatal({ event: 'startup_error', message: err.message });
    process.exit(1);
  }
});

const gracefulShutdown = async (signal: string) => {
  logger.info({ event: 'shutdown_initiated', signal });

  server.close(async (err) => {
    if (err) {
      logger.error({ event: 'server_close_error', message: err.message });
    } else {
      logger.info({ event: 'server_closed', message: 'HTTP server closed' });
    }

    try {
      await outboxWorker.stop();
      await closeRabbitMQ();
      logger.info({ event: 'rabbitmq_closed', message: 'RabbitMQ connections closed' });
    } catch (e: any) {
      logger.error({ event: 'rabbitmq_close_error', message: e.message });
    }

    try {
      await prisma.$disconnect();
      logger.info({ event: 'db_disconnected', message: 'Prisma disconnected' });
    } catch (e: any) {
      logger.error({ event: 'db_disconnect_error', message: e.message });
    }

    logger.info({ event: 'shutdown_complete' });
    process.exit(err ? 1 : 0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
