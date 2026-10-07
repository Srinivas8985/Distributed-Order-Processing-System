import amqplib, { Connection, Channel } from 'amqplib';
import { config } from '../config';
import { logger } from './logger';

let connection: any = null;
let channel: any = null;
let isConnecting = false;

const EXCHANGE_NAME = 'order.events';

export const connectRabbitMQ = async () => {
  if (connection || isConnecting) return;
  isConnecting = true;

  try {
    connection = await amqplib.connect(config.RABBITMQ_URL);
    channel = await connection.createConfirmChannel();
    
    await channel.assertExchange(EXCHANGE_NAME, 'topic', {
      durable: true,
      autoDelete: false
    });
    
    connection.on('error', (err: any) => {
      logger.error({ event: 'rabbitmq_error', message: err.message });
      connection = null;
      channel = null;
    });

    connection.on('close', () => {
      logger.warn({ event: 'rabbitmq_close', message: 'RabbitMQ connection closed' });
      connection = null;
      channel = null;
      // In a real prod environment we would implement an exponential backoff reconnect here.
      // For phase 7 we log it and health check will catch it.
    });

    logger.info({ event: 'rabbitmq_connected', message: 'Connected to RabbitMQ', exchange: EXCHANGE_NAME });
  } catch (err: any) {
    logger.error({ event: 'rabbitmq_connection_failed', message: err.message });
    throw err;
  } finally {
    isConnecting = false;
  }
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

export const publishEvent = async (routingKey: string, message: any): Promise<boolean> => {
  if (!channel) {
    throw new Error('RabbitMQ channel not established');
  }

  const payload = Buffer.from(JSON.stringify(message));
  
  return new Promise((resolve, reject) => {
    channel!.publish(
      EXCHANGE_NAME,
      routingKey,
      payload,
      {
        persistent: true,
        contentType: 'application/json',
        messageId: message.eventId,
        correlationId: message.correlationId,
        timestamp: Date.now()
      },
      (err: any) => {
        if (err) {
          logger.error({ event: 'event_publish_failed', error: err.message });
          reject(err);
        } else {
          resolve(true);
        }
      }
    );
  });
};
