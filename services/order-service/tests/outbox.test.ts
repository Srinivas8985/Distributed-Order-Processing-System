import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import crypto from 'crypto';

describe('Transactional Outbox (Phase 8)', () => {
  beforeAll(async () => {
    // Ensure DB is clean
    await prisma.idempotencyKey.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createPayload = (userId = crypto.randomUUID()) => ({
    userId,
    items: [
      {
        productName: 'Outbox Test Product',
        quantity: 2,
        unitPrice: 15.99
      }
    ]
  });

  let validUserId: string;

  it('setup: create a valid user for testing', async () => {
    const response = await fetch('http://127.0.0.1:3000/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `outbox-${Date.now()}@test.com`,
        name: 'Outbox Tester'
      })
    });
    const body = await response.json();
    validUserId = body.id;
  });

  it('should create order, order items, and outbox event atomically (TEST 1)', async () => {
    const payload = createPayload(validUserId);
    const key = `outbox-test-1-${Date.now()}`;

    const res = await request(app)
      .post('/orders')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res.status).toBe(201);
    const orderId = res.body.id;

    // Check DB for order
    const dbOrder = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    expect(dbOrder).toBeDefined();
    expect(dbOrder?.items.length).toBe(1);

    // Check DB for outbox event
    const outboxEvents = await prisma.outboxEvent.findMany();
    const relatedEvent = outboxEvents.find(e => (e.payload as any).data?.orderId === orderId);
    expect(relatedEvent).toBeDefined();
    expect(relatedEvent?.eventType).toBe('ORDER_CREATED');
    expect(relatedEvent?.status).toBe('PENDING');
  });

  it('should not create a second outbox event on repeated idempotent request (TEST 3 & 4)', async () => {
    const payload = createPayload(validUserId);
    const key = `outbox-test-2-${Date.now()}`;

    // First request
    const res1 = await request(app)
      .post('/orders')
      .set('Idempotency-Key', key)
      .send(payload);
    expect(res1.status).toBe(201);
    const orderId = res1.body.id;

    // Count outbox events for this order
    let outboxEvents = await prisma.outboxEvent.findMany();
    let relatedEvents = outboxEvents.filter(e => (e.payload as any).data?.orderId === orderId);
    expect(relatedEvents.length).toBe(1);

    // Second request (Duplicate)
    const res2 = await request(app)
      .post('/orders')
      .set('Idempotency-Key', key)
      .send(payload);
    expect(res2.status).toBe(200); // Idempotent cached response
    expect(res2.body.id).toBe(orderId);

    // Count outbox events again - should STILL BE 1
    outboxEvents = await prisma.outboxEvent.findMany();
    relatedEvents = outboxEvents.filter(e => (e.payload as any).data?.orderId === orderId);
    expect(relatedEvents.length).toBe(1);
  });

  it('should reject same key with different payload and not create outbox event (TEST 5)', async () => {
    const payload1 = createPayload(validUserId);
    const key = `outbox-test-3-${Date.now()}`;

    // First request
    await request(app)
      .post('/orders')
      .set('Idempotency-Key', key)
      .send(payload1);

    // Count outbox events before
    const initialOutboxCount = await prisma.outboxEvent.count();

    // Second request with different payload
    const payload2 = createPayload(validUserId);
    payload2.items[0].quantity = 99; // mutate

    const res2 = await request(app)
      .post('/orders')
      .set('Idempotency-Key', key)
      .send(payload2);
    
    expect(res2.status).toBe(409); // Conflict

    // Count outbox events after - should be unchanged
    const finalOutboxCount = await prisma.outboxEvent.count();
    expect(finalOutboxCount).toBe(initialOutboxCount);
  });

});
