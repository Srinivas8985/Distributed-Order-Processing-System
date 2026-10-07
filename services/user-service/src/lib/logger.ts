import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.LOG_LEVEL,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  base: {
    service: 'user-service',
    environment: config.NODE_ENV
  }
});
