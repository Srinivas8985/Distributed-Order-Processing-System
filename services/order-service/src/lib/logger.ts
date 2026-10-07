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
    service: 'order-service',
    environment: config.NODE_ENV
  }
});
