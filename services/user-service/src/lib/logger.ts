import pino from 'pino';
import { config } from '../config';
import { requestContext } from './context';
import { trace, context } from '@opentelemetry/api';

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
  },
  mixin() {
    const store = requestContext.getStore();
    const currentSpan = trace.getSpan(context.active());
    const mixinData: any = {};
    if (store?.requestId) mixinData.requestId = store.requestId;
    if (currentSpan) {
      mixinData.traceId = currentSpan.spanContext().traceId;
      mixinData.spanId = currentSpan.spanContext().spanId;
    }
    return mixinData;
  }
});
