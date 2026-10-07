import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';

// Mock dependencies
vi.mock('../src/config', () => ({
  config: {
    PORT: '3001',
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal'
  }
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{}]),
    $connect: vi.fn(),
    $disconnect: vi.fn()
  }
}));

vi.mock('../src/lib/rabbitmq', () => ({
  connectRabbitMQ: vi.fn(),
  closeRabbitMQ: vi.fn(),
  checkRabbitMQConnection: vi.fn().mockResolvedValue(true)
}));

describe('Order Service Foundation', () => {
  it('should return 200 for GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('order-service');
  });

  it('should return 200 for GET /ready', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.dependencies.database).toBe('up');
    expect(res.body.dependencies.rabbitmq).toBe('up');
  });

  it('should generate and propagate X-Request-ID', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
