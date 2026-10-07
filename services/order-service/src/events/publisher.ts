import { v4 as uuidv4 } from 'uuid';
import { publishEvent } from '../lib/rabbitmq';
import { eventEnvelopeSchema, OrderCreatedEvent } from './event.schema';
import { logger } from '../lib/logger';

export class EventPublisher {
  async publishOrderCreated(order: any, correlationId: string): Promise<void> {
    const event: OrderCreatedEvent = {
      eventId: uuidv4(),
      eventType: 'ORDER_CREATED',
      version: 1,
      occurredAt: new Date().toISOString(),
      producer: 'order-service',
      correlationId: correlationId,
      data: {
        orderId: order.id,
        userId: order.userId,
        totalAmount: Number(order.totalAmount),
        itemCount: order.items.length,
        status: order.status,
        createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt
      }
    };

    // Validate event envelope before sending
    const validatedEvent = eventEnvelopeSchema.parse(event);

    logger.info({
      event: 'event_publish_started',
      eventId: validatedEvent.eventId,
      eventType: validatedEvent.eventType,
      correlationId: validatedEvent.correlationId
    });

    await publishEvent('order.created', validatedEvent);

    logger.info({
      event: 'event_published',
      eventId: validatedEvent.eventId,
      eventType: validatedEvent.eventType,
      routingKey: 'order.created'
    });
  }
}

export const eventPublisher = new EventPublisher();
