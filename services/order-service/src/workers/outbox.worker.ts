import { prisma } from '../lib/prisma';
import { publishEvent, checkRabbitMQConnection } from '../lib/rabbitmq';
import { logger } from '../lib/logger';
import { faultEngine } from '../lib/fault-engine';
import { outboxMetrics } from '../lib/metrics';

export class OutboxWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly POLLING_INTERVAL_MS = 2000;
  private readonly BATCH_SIZE = 50;
  private readonly MAX_ATTEMPTS = 5;

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info({ event: 'outbox_worker_started' });
    this.poll();
  }

  async stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    logger.info({ event: 'outbox_worker_stopped' });
  }

  private async poll() {
    if (!this.isRunning) return;

    try {
      const isConnected = await checkRabbitMQConnection();
      if (isConnected) {
        await this.processOutboxEvents();
      } else {
        logger.warn({ event: 'outbox_worker_waiting', message: 'RabbitMQ disconnected, waiting to process events' });
      }
    } catch (error: any) {
      logger.error({
        event: 'outbox_worker_error',
        error: error.message
      });
    } finally {
      if (this.isRunning) {
        this.intervalId = setTimeout(() => this.poll(), this.POLLING_INTERVAL_MS);
      }
    }
  }

  private async processOutboxEvents() {
    outboxMetrics.pending.set(await prisma.outboxEvent.count({ where: { status: 'PENDING' } }));

    const events = await prisma.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        attempts: {
          lt: this.MAX_ATTEMPTS
        }
      },
      take: this.BATCH_SIZE,
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (events.length === 0) return;

    for (const event of events) {
      if (!this.isRunning) break;

      logger.info({
        event: 'outbox_publish_started',
        eventId: event.id,
        eventType: event.eventType,
        attempts: event.attempts
      });

      try {
        const payload = event.payload as any;
        // Determine routing key based on event type
        const routingKey = event.eventType === 'ORDER_CREATED' ? 'order.created' : 'unknown.event';

        await faultEngine.evaluateFaultsByComponent('publisher', event.id);

        // Publish to RabbitMQ
        await publishEvent(routingKey, payload);

        // Mark as PUBLISHED
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'PUBLISHED' }
        });

        logger.info({
          event: 'outbox_publish_succeeded',
          eventId: event.id,
          eventType: event.eventType
        });
        outboxMetrics.published.inc({ service: 'order-service' });
      } catch (error: any) {
        // Handle failure
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts: { increment: 1 }
          }
        });

        logger.error({
          event: 'outbox_publish_failed',
          eventId: event.id,
          error: error.message,
          attempts: event.attempts + 1
        });

        if (event.attempts + 1 >= this.MAX_ATTEMPTS) {
          logger.error({
            event: 'outbox_max_attempts_reached',
            eventId: event.id
          });
          outboxMetrics.failed.inc({ service: 'order-service' });
        }
      }
    }
  }
}

export const outboxWorker = new OutboxWorker();
