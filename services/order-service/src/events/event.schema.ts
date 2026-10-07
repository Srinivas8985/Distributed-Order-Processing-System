import { z } from 'zod';

export const orderCreatedPayloadSchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
  totalAmount: z.number().positive(),
  itemCount: z.number().int().positive(),
  status: z.string(),
  createdAt: z.string().datetime()
});

export const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.literal('ORDER_CREATED'),
  version: z.literal(1),
  occurredAt: z.string().datetime(),
  producer: z.literal('order-service'),
  correlationId: z.string().uuid(),
  data: orderCreatedPayloadSchema
});

export type OrderCreatedEvent = z.infer<typeof eventEnvelopeSchema>;
