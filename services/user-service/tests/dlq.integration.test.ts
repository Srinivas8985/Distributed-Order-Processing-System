import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { connectRabbitMQ, closeRabbitMQ, publishToExchange } from '../src/lib/rabbitmq';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../src/config';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

describe('DLQ and Event Replay System (Phase 9)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await connectRabbitMQ();
  });

  afterAll(async () => {
    await closeRabbitMQ();
    await prisma.$disconnect();
  });

  const validToken = config.INTERNAL_SERVICE_TOKEN;

  describe('API Authorization', () => {
    it('should reject unauthorized replay requests', async () => {
      const res = await request(app).post('/internal/dlq/fake-id/replay');
      expect(res.status).toBe(401);
    });

    it('should reject unauthorized list requests', async () => {
      const res = await request(app).get('/internal/dlq');
      expect(res.status).toBe(401);
    });
  });

  describe('Event eventually reaching DLQ and Replay', () => {
    let dlqEventId: string;
    const poisonEventId = uuidv4();

    it('should capture failed event metadata in DLQ when permanent error occurs', async () => {
      // Publish invalid JSON to trigger permanent failure immediately
      await publishToExchange('order.events', 'order.created', {
        eventId: poisonEventId,
        eventType: 'ORDER_CREATED',
        // missing required fields triggers ZodError (permanent)
      });

      // Poll database for the DLQ event
      let dlqEvent = null;
      for (let i = 0; i < 20; i++) {
        await delay(500);
        dlqEvent = await prisma.deadLetterEvent.findFirst({
          where: { eventId: poisonEventId }
        });
        if (dlqEvent) break;
      }

      expect(dlqEvent).toBeDefined();
      expect(dlqEvent!.eventId).toBe(poisonEventId);
      expect(dlqEvent!.replayStatus).toBe('PENDING');
      expect(dlqEvent!.attemptCount).toBe(1); // Permanent failure fails on first attempt
      expect(dlqEvent!.failureReason).toContain('Required'); // Zod error message
      
      dlqEventId = dlqEvent!.id;
    });

    it('should list DLQ events', async () => {
      const res = await request(app)
        .get('/internal/dlq')
        .set('X-Service-Auth', validToken);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const found = res.body.data.find((e: any) => e.eventId === poisonEventId);
      expect(found).toBeDefined();
    });

    it('should fail replay if event fails again', async () => {
      const res = await request(app)
        .post(`/internal/dlq/${dlqEventId}/replay`)
        .set('X-Service-Auth', validToken);

      // The replay itself publishes successfully to exchange, returning 200.
      // But the consumer will process it again and fail again!
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Replay successful');

      // Wait for consumer to process the replayed message and fail it again
      await delay(2000);

      // The consumer will move it to DLQ again. Since our DLQ archiver creates a NEW record for each DLQ entry
      // (or updates? wait, we use findFirst. Our archiver uses create!)
      const events = await prisma.deadLetterEvent.findMany({
        where: { eventId: poisonEventId },
        orderBy: { createdAt: 'desc' }
      });
      
      expect(events.length).toBe(2); // The original one + the newly failed one!
      
      // The original one was marked REPLAYED by the controller
      const original = await prisma.deadLetterEvent.findUnique({ where: { id: dlqEventId } });
      expect(original!.replayStatus).toBe('REPLAYED');
      expect(original!.replayCount).toBe(1);
    });
  });

  describe('Successful Replay and Idempotency', () => {
    const validEventId = uuidv4();
    let dlqEventId: string;

    beforeAll(async () => {
      // Manually insert a PENDING DLQ event that is actually valid payload, 
      // simulating a case where it failed due to a transient issue that is now resolved.
      const dlq = await prisma.deadLetterEvent.create({
        data: {
          eventId: validEventId,
          eventType: 'ORDER_CREATED',
          routingKey: 'order.created',
          payload: {
            eventId: validEventId,
            eventType: 'ORDER_CREATED',
            version: 1,
            occurredAt: new Date().toISOString(),
            producer: 'order-service',
            correlationId: uuidv4(),
            data: {
              orderId: uuidv4(),
              userId: uuidv4(),
              totalAmount: 100,
              itemCount: 1,
              status: 'PENDING',
              createdAt: new Date().toISOString()
            }
          },
          attemptCount: 3,
          failureReason: 'Transient DB Connection Error',
          firstFailureAt: new Date(),
          latestFailureAt: new Date()
        }
      });
      dlqEventId = dlq.id;
    });

    it('should successfully replay a valid DLQ event', async () => {
      const res = await request(app)
        .post(`/internal/dlq/${dlqEventId}/replay`)
        .set('X-Service-Auth', validToken);

      expect(res.status).toBe(200);

      // Wait for consumer to process it
      await delay(1000);

      const processed = await prisma.processedEvent.findUnique({
        where: { eventId: validEventId }
      });
      expect(processed).toBeDefined(); // It successfully processed!
      
      const dbEvent = await prisma.deadLetterEvent.findUnique({ where: { id: dlqEventId } });
      expect(dbEvent!.replayStatus).toBe('REPLAYED');
    });

    it('should prevent replay of an already replayed event (consumer idempotency safeguard)', async () => {
      const res = await request(app)
        .post(`/internal/dlq/${dlqEventId}/replay`)
        .set('X-Service-Auth', validToken);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });
});
