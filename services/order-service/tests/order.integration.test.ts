import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

describe('Order Service Integration (Phase 3)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const testUserId = uuidv4();
  let createdOrderId: string;
  let realUserId: string;

  describe('POST /orders', () => {
    it('should create a valid user in user-service for testing', async () => {
      // Direct HTTP call to user-service to create a user
      const response = await fetch('http://127.0.0.1:3000/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `test-${uuidv4()}@example.com`,
          name: 'Integration Test User'
        })
      });
      expect(response.status).toBe(201);
      const data = await response.json();
      realUserId = data.id;
    });

    it('should create a valid order (Valid flow with Real User)', async () => {
      const res = await request(app)
        .post('/orders')
        .set('Idempotency-Key', uuidv4())
        .send({
          userId: realUserId,
          items: [
            { productName: 'Wireless Mouse', quantity: 2, unitPrice: 29.99 },
            { productName: 'USB-C Cable', quantity: 1, unitPrice: 12.50 }
          ]
        });
      
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.userId).toBe(realUserId);
      expect(res.body.status).toBe('CONFIRMED');
      expect(res.body.items).toHaveLength(2);
      expect(res.body.totalAmount).toBe(72.48);
      expect(res.headers['x-request-id']).toBeDefined();

      createdOrderId = res.body.id;
    });

    it('should reject order if user does not exist in user-service', async () => {
      const nonexistentUserId = uuidv4();
      const res = await request(app)
        .post('/orders')
        .set('Idempotency-Key', uuidv4())
        .send({
          userId: nonexistentUserId,
          items: [{ productName: 'Mouse', quantity: 1, unitPrice: 10 }]
        });
      
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('USER_NOT_FOUND');
    });

    it('should reject missing userId', async () => {
      const res = await request(app)
        .post('/orders')
        .set('Idempotency-Key', uuidv4())
        .send({
          items: [{ productName: 'Mouse', quantity: 1, unitPrice: 10 }]
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject missing items', async () => {
      const res = await request(app)
        .post('/orders')
        .set('Idempotency-Key', uuidv4())
        .send({ userId: testUserId });
      
      expect(res.status).toBe(400);
    });

    it('should reject empty items', async () => {
      const res = await request(app)
        .post('/orders')
        .set('Idempotency-Key', uuidv4())
        .send({ userId: testUserId, items: [] });
      
      expect(res.status).toBe(400);
    });

    it('should reject zero quantity', async () => {
      const res = await request(app)
        .post('/orders')
        .set('Idempotency-Key', uuidv4())
        .send({
          userId: testUserId,
          items: [{ productName: 'Mouse', quantity: 0, unitPrice: 10 }]
        });
      
      expect(res.status).toBe(400);
    });

    it('should reject negative amount', async () => {
      const res = await request(app)
        .post('/orders')
        .set('Idempotency-Key', uuidv4())
        .send({
          userId: testUserId,
          items: [{ productName: 'Mouse', quantity: 1, unitPrice: -10 }]
        });
      
      expect(res.status).toBe(400);
    });

    it('should reject amount with >2 decimal places', async () => {
      const res = await request(app)
        .post('/orders')
        .set('Idempotency-Key', uuidv4())
        .send({
          userId: testUserId,
          items: [{ productName: 'Mouse', quantity: 1, unitPrice: 10.999 }]
        });
      
      expect(res.status).toBe(400);
    });
    
    it('transaction consistency: should fail gracefully if item validation fails before DB', async () => {
      const countBefore = await prisma.order.count();
      const res = await request(app)
        .post('/orders')
        .set('Idempotency-Key', uuidv4())
        .send({
          userId: testUserId,
          items: [{ productName: 'Mouse', quantity: 0, unitPrice: 10 }]
        });
      expect(res.status).toBe(400);
      const countAfter = await prisma.order.count();
      expect(countAfter).toBe(countBefore); // Proves DB consistency
    });
  });

  describe('GET /orders/:id', () => {
    it('should return existing order with items', async () => {
      const res = await request(app).get(`/orders/${createdOrderId}`);
      
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdOrderId);
      expect(res.body.userId).toBe(realUserId);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.totalAmount).toBe(72.48);
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = uuidv4();
      const res = await request(app).get(`/orders/${fakeId}`);
      
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('ORDER_NOT_FOUND');
    });

    it('should reject invalid UUID format', async () => {
      const res = await request(app).get(`/orders/invalid-id-format`);
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });
});
