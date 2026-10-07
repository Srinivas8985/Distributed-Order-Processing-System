import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventPublisher } from '../src/events/publisher';
import * as rabbitmq from '../src/lib/rabbitmq';

vi.mock('../src/lib/rabbitmq', () => ({
  publishEvent: vi.fn()
}));

describe('Publisher - EventPublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should publish a properly formatted ORDER_CREATED event', async () => {
    const publisher = new EventPublisher();
    const order = {
      id: 'order-123',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      totalAmount: 50.5,
      items: [{}, {}], // length 2
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    // Override order ID to be valid UUID for Zod
    order.id = '123e4567-e89b-12d3-a456-426614174001';

    const correlationId = '123e4567-e89b-12d3-a456-426614174002';

    await publisher.publishOrderCreated(order, correlationId);

    expect(rabbitmq.publishEvent).toHaveBeenCalledTimes(1);
    
    const callArgs = vi.mocked(rabbitmq.publishEvent).mock.calls[0];
    expect(callArgs[0]).toBe('order.created'); // routing key
    
    const event = callArgs[1];
    expect(event.eventType).toBe('ORDER_CREATED');
    expect(event.correlationId).toBe(correlationId);
    expect(event.producer).toBe('order-service');
    expect(event.version).toBe(1);
    expect(event.eventId).toBeDefined();
    
    expect(event.data.orderId).toBe(order.id);
    expect(event.data.userId).toBe(order.userId);
    expect(event.data.totalAmount).toBe(order.totalAmount);
    expect(event.data.itemCount).toBe(2);
    expect(event.data.status).toBe(order.status);
  });
});
