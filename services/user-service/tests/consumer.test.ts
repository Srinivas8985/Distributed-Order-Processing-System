import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleOrderCreated } from '../src/events/consumer';
import { prisma } from '../src/lib/prisma';
import { ConsumeMessage } from 'amqplib';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (cb) => {
      // Mock the transaction by just calling the callback with a mock tx object
      const tx = {
        processedEvent: {
          findUnique: vi.fn(),
          create: vi.fn()
        },
        activityHistory: {
          create: vi.fn()
        }
      };
      return cb(tx);
    })
  }
}));

describe('Consumer - handleOrderCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process a valid event and insert into activity_history and processed_events', async () => {
    const validEvent = {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      eventType: 'ORDER_CREATED',
      version: 1,
      occurredAt: new Date().toISOString(),
      producer: 'order-service',
      correlationId: '123e4567-e89b-12d3-a456-426614174001',
      data: {
        orderId: '123e4567-e89b-12d3-a456-426614174002',
        userId: '123e4567-e89b-12d3-a456-426614174003',
        totalAmount: 100,
        itemCount: 2,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      }
    };

    const msg = {
      content: Buffer.from(JSON.stringify(validEvent)),
      properties: {},
      fields: {}
    } as ConsumeMessage;

    // Simulate that processedEvent.findUnique returns null (not processed yet)
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => {
      const tx = {
        processedEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn()
        },
        activityHistory: {
          create: vi.fn()
        }
      };
      await cb(tx);
      expect(tx.activityHistory.create).toHaveBeenCalledWith({
        data: {
          userId: validEvent.data.userId,
          activity: expect.stringContaining(validEvent.data.orderId)
        }
      });
      expect(tx.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: validEvent.eventId }
      });
    });

    await handleOrderCreated(msg);
  });

  it('should ignore duplicate events (idempotency)', async () => {
    const validEvent = {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      eventType: 'ORDER_CREATED',
      version: 1,
      occurredAt: new Date().toISOString(),
      producer: 'order-service',
      correlationId: '123e4567-e89b-12d3-a456-426614174001',
      data: {
        orderId: '123e4567-e89b-12d3-a456-426614174002',
        userId: '123e4567-e89b-12d3-a456-426614174003',
        totalAmount: 100,
        itemCount: 2,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      }
    };

    const msg = {
      content: Buffer.from(JSON.stringify(validEvent))
    } as ConsumeMessage;

    // Simulate that processedEvent.findUnique returns an existing record
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => {
      const tx = {
        processedEvent: {
          findUnique: vi.fn().mockResolvedValue({ eventId: validEvent.eventId }),
          create: vi.fn()
        },
        activityHistory: {
          create: vi.fn()
        }
      };
      await cb(tx);
      expect(tx.activityHistory.create).not.toHaveBeenCalled();
      expect(tx.processedEvent.create).not.toHaveBeenCalled();
    });

    await handleOrderCreated(msg);
  });

  it('should throw an error for invalid JSON', async () => {
    const msg = {
      content: Buffer.from('invalid-json')
    } as ConsumeMessage;

    await expect(handleOrderCreated(msg)).rejects.toThrow('Message is not valid JSON');
  });

  it('should throw an error for missing required fields (Zod validation)', async () => {
    const invalidEvent = {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      eventType: 'ORDER_CREATED',
      version: 1,
      // Missing data
    };

    const msg = {
      content: Buffer.from(JSON.stringify(invalidEvent))
    } as ConsumeMessage;

    await expect(handleOrderCreated(msg)).rejects.toThrow();
  });
});
