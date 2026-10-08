import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { ApplicationError } from '../utils/errors';
import { publishToExchange } from '../lib/rabbitmq';

export const listDlqEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string;
    
    const events = await prisma.deadLetterEvent.findMany({
      where: status ? { replayStatus: status.toUpperCase() } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({
      data: events.map(e => ({
        id: e.id,
        eventId: e.eventId,
        eventType: e.eventType,
        attemptCount: e.attemptCount,
        failureReason: e.failureReason,
        firstFailureAt: e.firstFailureAt,
        latestFailureAt: e.latestFailureAt,
        replayStatus: e.replayStatus,
        replayCount: e.replayCount
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const getDlqEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    
    const event = await prisma.deadLetterEvent.findUnique({
      where: { id }
    });

    if (!event) {
      throw new ApplicationError('NOT_FOUND', 'DLQ event not found', 404);
    }

    res.json({ data: event });
  } catch (error) {
    next(error);
  }
};

export const replayDlqEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    
    const event = await prisma.deadLetterEvent.findUnique({
      where: { id }
    });

    if (!event) {
      throw new ApplicationError('NOT_FOUND', 'DLQ event not found', 404);
    }

    // Validation
    if (event.replayStatus === 'REPLAYED') {
      throw new ApplicationError('VALIDATION_ERROR', 'Event has already been replayed successfully', 400);
    }

    // Processed events check (consumer idempotency final safeguard before replay)
    const processed = await prisma.processedEvent.findUnique({
      where: { eventId: event.eventId }
    });

    if (processed) {
      // Mark as replayed because it actually succeeded at some point or was duplicate
      await prisma.deadLetterEvent.update({
        where: { id },
        data: { replayStatus: 'REPLAYED', replayCount: { increment: 1 } }
      });
      throw new ApplicationError('VALIDATION_ERROR', 'Event is already marked as processed in the system. Replay bypassed.', 400);
    }

    logger.info({ event: 'event_replay_started', dlqId: id, eventId: event.eventId });

    try {
      // Republish to original exchange and routing key
      await publishToExchange('order.events', event.routingKey, event.payload);
      
      // Update DB record
      await prisma.deadLetterEvent.update({
        where: { id },
        data: { 
          replayStatus: 'REPLAYED',
          replayCount: { increment: 1 } 
        }
      });

      logger.info({ event: 'event_replay_succeeded', dlqId: id, eventId: event.eventId });
      
      res.json({ message: 'Replay successful', eventId: event.eventId });
    } catch (publishErr: any) {
      await prisma.deadLetterEvent.update({
        where: { id },
        data: { 
          replayStatus: 'FAILED',
          replayCount: { increment: 1 } 
        }
      });

      logger.error({ event: 'event_replay_failed', dlqId: id, eventId: event.eventId, error: publishErr.message });
      throw new ApplicationError('INTERNAL_ERROR', `Failed to republish event: ${publishErr.message}`, 500);
    }
  } catch (error) {
    next(error);
  }
};
