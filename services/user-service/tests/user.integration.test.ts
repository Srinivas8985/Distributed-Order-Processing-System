import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

describe('User Service Integration (Phase 2)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const testEmail = `test-${uuidv4()}@example.com`;
  let createdUserId: string;

  describe('POST /users', () => {
    it('should create a valid user (Valid flow)', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: testEmail, name: 'Integration Test User' });
      
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.email).toBe(testEmail);
      expect(res.body.name).toBe('Integration Test User');
      expect(res.headers['x-request-id']).toBeDefined();

      createdUserId = res.body.id;
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: `only-email-${uuidv4()}@example.com` });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed email', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: 'not-an-email', name: 'Test' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should prevent duplicate user creation (Conflict)', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: testEmail, name: 'Duplicate User' });
      
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('USER_ALREADY_EXISTS');
    });
  });

  describe('GET /users/:id', () => {
    it('should return existing user', async () => {
      const res = await request(app).get(`/users/${createdUserId}`);
      
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdUserId);
      expect(res.body.email).toBe(testEmail);
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = uuidv4();
      const res = await request(app).get(`/users/${fakeId}`);
      
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('USER_NOT_FOUND');
    });

    it('should reject invalid UUID format', async () => {
      const res = await request(app).get(`/users/invalid-id-format`);
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /internal/users/:id/verify', () => {
    it('should verify an existing user with valid token', async () => {
      const res = await request(app)
        .get(`/internal/users/${createdUserId}/verify`)
        .set('X-Service-Auth', process.env.INTERNAL_SERVICE_TOKEN || 'test-token');
      
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdUserId);
      expect(res.body.verified).toBe(true);
    });

    it('should reject missing service token', async () => {
      const res = await request(app)
        .get(`/internal/users/${createdUserId}/verify`);
      
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid service token', async () => {
      const res = await request(app)
        .get(`/internal/users/${createdUserId}/verify`)
        .set('X-Service-Auth', 'wrong-token');
      
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 for non-existent user with valid token', async () => {
      const fakeId = uuidv4();
      const res = await request(app)
        .get(`/internal/users/${fakeId}/verify`)
        .set('X-Service-Auth', process.env.INTERNAL_SERVICE_TOKEN || 'test-token');
      
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('USER_NOT_FOUND');
    });
  });
});
