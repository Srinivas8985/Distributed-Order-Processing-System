import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { OrderCreatedEvent, eventEnvelopeSchema } from '../events/event.schema';

export interface OrderItemInput {
  productName: string;
  quantity: number;
  unitPrice: number;
}

export class OrderRepository {
  async createOrder(userId: string, items: OrderItemInput[], totalAmount: number, correlationId: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Create Order and Items
      const order = await tx.order.create({
        data: {
          userId,
          totalAmount,
          items: {
            create: items.map(item => ({
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice
            }))
          }
        },
        include: {
          items: true
        }
      });

      // 2. Prepare Event Payload
      const eventId = uuidv4();
      const event: OrderCreatedEvent = {
        eventId,
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
          createdAt: order.createdAt.toISOString()
        }
      };

      // 3. Validate Event Envelope
      const validatedEvent = eventEnvelopeSchema.parse(event);

      // 4. Create Outbox Event Atomically
      await tx.outboxEvent.create({
        data: {
          id: validatedEvent.eventId,
          eventType: validatedEvent.eventType,
          payload: validatedEvent as any,
          status: 'PENDING'
        }
      });

      return order;
    });
  }

  async findOrderById(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        items: true
      }
    });
  }
}
