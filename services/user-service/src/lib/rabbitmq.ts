import amqplib, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { config } from '../config';
import { logger } from './logger';
import { handleOrderCreated } from '../events/consumer';
import { prisma } from './prisma';
import { eventProcessingCounter, dlqTransfersCounter } from './metrics';

let connection: any = null;
let channel: any = null;
let isConnecting = false;

const EXCHANGE_NAME = 'order.events';
const QUEUE_NAME = 'user.activity.queue';
const ROUTING_KEY = 'order.created';

const DLX_NAME = 'order.events.dlx';
const DLQ_NAME = 'user.activity.dlq';

export const connectRabbitMQ = async () => {
  if (connection || isConnecting) return;
  isConnecting = true;

  try {
    connection = await amqplib.connect(config.RABBITMQ_URL);
    channel = await connection.createChannel();
    
    await channel.prefetch(10);
    
    // Main Exchange
    await channel.assertExchange(EXCHANGE_NAME, 'topic', {
      durable: true,
      autoDelete: false
    });

    // DLX Exchange
    await channel.assertExchange(DLX_NAME, 'topic', {
      durable: true,
      autoDelete: false
    });
    
    // DLQ Queue
    await channel.assertQueue(DLQ_NAME, {
      durable: true
    });
    await channel.bindQueue(DLQ_NAME, DLX_NAME, '#');

    // Main Queue
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX_NAME
      }
    });
    logger.info({ event: 'rabbitmq_queue_declared', queue: QUEUE_NAME, dlq: DLQ_NAME });
    
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);
    
    connection.on('error', (err: any) => {
      logger.error({ event: 'rabbitmq_error', message: err.message });
      connection = null;
      channel = null;
    });

    connection.on('close', () => {
      logger.warn({ event: 'rabbitmq_close', message: 'RabbitMQ connection closed' });
      connection = null;
      channel = null;
    });

    logger.info({ event: 'rabbitmq_connected', message: 'Connected to RabbitMQ' });

    // Start consuming
    startConsumer();
    startDlqArchiver();

  } catch (err: any) {
    logger.error({ event: 'rabbitmq_connection_failed', message: err.message });
    throw err;
  } finally {
    isConnecting = false;
  }
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const startConsumer = () => {
  if (!channel) return;
  
  channel.consume(QUEUE_NAME, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    let payload: any;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch (e) {
      // Invalid JSON is a permanent error. Send to DLQ immediately.
      await moveToDlq(msg, 'Invalid JSON format', 1);
      channel!.ack(msg);
      return;
    }

    const eventId = payload.eventId || msg.properties.messageId || 'unknown';
    const MAX_ATTEMPTS = 3;
    let attempts = 0;
    
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        await handleOrderCreated(msg);
        channel!.ack(msg);
        eventProcessingCounter.inc({ event_type: payload.eventType || 'UNKNOWN', status: 'success', service: 'user-service' });
        return; // Success
      } catch (err: any) {
        logger.error({ 
          event: 'event_processing_failed', 
          eventId, 
          attempt: attempts, 
          error: err.message 
        });

        const isPermanent = err.name === 'ZodError' || err.code === 'VALIDATION_ERROR';
        
        if (isPermanent || attempts >= MAX_ATTEMPTS) {
          logger.warn({
            event: 'event_moved_to_dlq',
            eventId,
            reason: isPermanent ? 'permanent_failure' : 'max_retries_exceeded'
          });
          
          await moveToDlq(msg, err.message, attempts);
          eventProcessingCounter.inc({ event_type: payload.eventType || 'UNKNOWN', status: 'failed', service: 'user-service' });
          channel!.ack(msg);
          return;
        }

        // Transient failure, wait before retry
        logger.info({ event: 'event_retry_scheduled', eventId, attempt: attempts });
        await delay(1000 * Math.pow(2, attempts)); // Exponential backoff: 2s, 4s...
      }
    }
  });
};

const moveToDlq = async (msg: ConsumeMessage, reason: string, attempts: number) => {
  if (!channel) return;
  
  const headers = msg.properties.headers || {};
  headers['x-failure-reason'] = reason;
  headers['x-attempt-count'] = attempts;
  headers['x-first-failure-timestamp'] = headers['x-first-failure-timestamp'] || Date.now();
  headers['x-latest-failure-timestamp'] = Date.now();
  headers['x-original-routing-key'] = msg.fields.routingKey;

  channel.publish(DLX_NAME, msg.fields.routingKey, msg.content, {
    persistent: true,
    headers,
    messageId: msg.properties.messageId,
    correlationId: msg.properties.correlationId,
    contentType: msg.properties.contentType
  });
  
  const payload = JSON.parse(msg.content.toString());
  dlqTransfersCounter.inc({ event_type: payload.eventType || 'UNKNOWN', service: 'user-service' });
};

const startDlqArchiver = () => {
  if (!channel) return;

  channel.consume(DLQ_NAME, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    try {
      let payload: any = {};
      try {
        payload = JSON.parse(msg.content.toString());
      } catch(e) {}

      const headers = msg.properties.headers || {};
      const failureReason = headers['x-failure-reason']?.toString() || 'Unknown failure';
      const attemptCount = headers['x-attempt-count'] ? parseInt(headers['x-attempt-count']) : 1;
      const originalRoutingKey = headers['x-original-routing-key']?.toString() || msg.fields.routingKey;
      
      const eventId = payload.eventId || msg.properties.messageId || 'unknown';
      const eventType = payload.eventType || 'UNKNOWN';

      await prisma.deadLetterEvent.create({
        data: {
          eventId,
          eventType,
          routingKey: originalRoutingKey,
          payload,
          attemptCount,
          failureReason,
          firstFailureAt: new Date(headers['x-first-failure-timestamp'] || Date.now()),
          latestFailureAt: new Date(headers['x-latest-failure-timestamp'] || Date.now()),
          replayStatus: 'PENDING',
          replayCount: 0
        }
      });

      channel!.ack(msg);
      logger.info({ event: 'dlq_event_archived', eventId });
    } catch (err: any) {
      logger.error({ event: 'dlq_archiver_failed', error: err.message });
      // If saving to DB fails, leave it in the RabbitMQ DLQ
      channel!.nack(msg, false, true);
    }
  });
};

export const publishToExchange = async (exchange: string, routingKey: string, message: any): Promise<void> => {
  if (!channel) throw new Error('RabbitMQ channel not established');
  
  const payload = Buffer.from(JSON.stringify(message));
  channel.publish(exchange, routingKey, payload, {
    persistent: true,
    contentType: 'application/json',
    messageId: message.eventId,
    correlationId: message.correlationId,
    timestamp: Date.now()
  });
};

export const closeRabbitMQ = async () => {
  if (channel) await channel.close();
  if (connection) await connection.close();
};

export const checkRabbitMQConnection = async (): Promise<boolean> => {
  if (!connection) {
    try {
      await connectRabbitMQ();
      return true;
    } catch {
      return false;
    }
  }
  return true;
};
