import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000]
});
register.registerMetric(httpRequestDuration);

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'code']
});
register.registerMetric(httpRequestsTotal);

export const eventProcessingCounter = new client.Counter({
  name: 'event_processing_total',
  help: 'Total number of events processed',
  labelNames: ['event_type', 'status', 'service']
});
register.registerMetric(eventProcessingCounter);

export const dlqTransfersCounter = new client.Counter({
  name: 'dlq_transfers_total',
  help: 'Total number of events transferred to DLQ',
  labelNames: ['event_type', 'service']
});
register.registerMetric(dlqTransfersCounter);

export const outboxMetrics = {
  pending: new client.Gauge({
    name: 'outbox_pending_events',
    help: 'Current number of pending events in the outbox',
    labelNames: ['service']
  }),
  published: new client.Counter({
    name: 'outbox_published_events_total',
    help: 'Total number of successfully published outbox events',
    labelNames: ['service']
  }),
  failed: new client.Counter({
    name: 'outbox_failed_events_total',
    help: 'Total number of outbox events that permanently failed',
    labelNames: ['service']
  })
};
register.registerMetric(outboxMetrics.pending);
register.registerMetric(outboxMetrics.published);
register.registerMetric(outboxMetrics.failed);

export const circuitBreakerCounter = new client.Counter({
  name: 'circuit_breaker_events_total',
  help: 'Total number of circuit breaker events',
  labelNames: ['service', 'state', 'target']
});
register.registerMetric(circuitBreakerCounter);

export const retryCounter = new client.Counter({
  name: 'retry_attempts_total',
  help: 'Total number of retry attempts',
  labelNames: ['service', 'target']
});
register.registerMetric(retryCounter);

export const externalRequestCounter = new client.Counter({
  name: 'external_request_total',
  help: 'Total external requests',
  labelNames: ['service', 'target', 'status']
});
register.registerMetric(externalRequestCounter);

export const timeoutCounter = new client.Counter({
  name: 'external_timeout_total',
  help: 'Total external request timeouts',
  labelNames: ['service', 'target']
});
register.registerMetric(timeoutCounter);
