import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/order.service';
import { logger } from '../lib/logger';

import { RequestFingerprint } from '../utils/fingerprint';
import { IdempotencyService } from '../services/idempotency.service';
import { eventPublisher } from '../events/publisher';
import { ApplicationError } from '../utils/errors';

const orderService = new OrderService();
const idempotencyService = new IdempotencyService();

const mapOrderResponse = (order: any) => ({
  id: order.id,
  userId: order.userId,
  status: order.status,
  items: order.items.map((item: any) => ({
    id: item.id,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice)
  })),
  totalAmount: Number(order.totalAmount),
  createdAt: order.createdAt,
  updatedAt: order.updatedAt
});

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new ApplicationError('VALIDATION_ERROR', 'Idempotency-Key header is required', 400);
    }
    if (idempotencyKey.length > 255) {
      throw new ApplicationError('VALIDATION_ERROR', 'Idempotency-Key header too long', 400);
    }

    const requestHash = RequestFingerprint.generate(req.body);

    const { code, body } = await idempotencyService.runIdempotentAction(
      idempotencyKey,
      requestHash,
      async () => {
        const { userId, items } = req.body;
        const order = await orderService.createOrder(userId, items, req.id);
        
        logger.info({
          event: 'order_created',
          service: 'order-service',
          requestId: req.id,
          orderId: order.id,
          userId: order.userId
        });

        // Note: Event is now published via Outbox Pattern in a background worker

        return { code: 201, body: mapOrderResponse(order) };
      }
    );

    res.status(code).json(body);
  } catch (error) {
    next(error);
  }
};

export const getOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const order = await orderService.getOrderById(id as string);

    logger.info({
      event: 'order_fetched',
      service: 'order-service',
      requestId: req.id,
      orderId: order.id
    });

    res.status(200).json(mapOrderResponse(order));
  } catch (error) {
    next(error);
  }
};
