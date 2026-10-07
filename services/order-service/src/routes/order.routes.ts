import { Router } from 'express';
import { createOrder, getOrder } from '../controllers/order.controller';
import { validate } from '../middleware/validate';
import { createOrderSchema, orderIdSchema } from '../schemas/order.schema';

export const orderRouter = Router();

orderRouter.post('/orders', validate(createOrderSchema), createOrder);
orderRouter.get('/orders/:id', validate(orderIdSchema), getOrder);
