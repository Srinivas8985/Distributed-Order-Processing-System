import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('query', (e) => {
  logger.debug({ event: 'db_query', query: e.query, durationMs: e.duration });
});

prisma.$on('error', (e) => {
  logger.error({ event: 'db_error', message: e.message });
});
