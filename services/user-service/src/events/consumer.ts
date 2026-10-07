import { ConsumeMessage } from 'amqplib';
import { eventEnvelopeSchema } from './event.schema';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { ApplicationError } from '../utils/errors';

export const handleOrderCreated = async (msg: ConsumeMessage) => {
  const content = msg.content.toString();
  
  let payload: any;
  try {
    payload = JSON.parse(content);
  } catch (err) {
    throw new ApplicationError('VALIDATION_ERROR', 'Message is not valid JSON', 400);
  }

  // 3. validate event envelope
  const validatedEvent = eventEnvelopeSchema.parse(payload);
  const { eventId } = validatedEvent;

  logger.info({
    event: 'event_received',
    eventId,
    eventType: validatedEvent.eventType,
    correlationId: validatedEvent.correlationId
  });

  // Check if processed and process in a transaction
  try {
    await prisma.$transaction(async (tx) => {
      // a. Check processed_events for eventId
      const existing = await tx.processedEvent.findUnique({
        where: { eventId }
      });

      if (existing) {
        // If exists: skip (duplicate)
        logger.info({ event: 'event_duplicate', eventId, message: 'Event already processed' });
        return; // Early return, will be ACKed
      }

      logger.info({ event: 'event_processing_started', eventId });

      // b. INSERT INTO activity_history
      await tx.activityHistory.create({
        data: {
          userId: validatedEvent.data.userId,
          activity: `Order ${validatedEvent.data.orderId} created for ${validatedEvent.data.totalAmount}`,
          // occurredAt is business time, we use it for some fields if needed, 
          // but ActivityHistory just has createdAt (default now)
        }
      });

      // c. INSERT INTO processed_events
      await tx.processedEvent.create({
        data: {
          eventId,
        }
      });

      logger.info({ event: 'event_processed', eventId, orderId: validatedEvent.data.orderId });
    });
  } catch (error: any) {
    logger.error({ event: 'event_processing_failed', eventId, error: error.message });
    throw error;
  }
};
