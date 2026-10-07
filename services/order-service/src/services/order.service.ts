import { OrderRepository, OrderItemInput } from '../repositories/order.repository';
import { NotFoundError, ServiceUnavailableError, ApplicationError } from '../utils/errors';
import { UserServiceClient } from '../infrastructure/user-service.client';
import { logger } from '../lib/logger';

export class OrderService {
  private orderRepository: OrderRepository;
  private userServiceClient: UserServiceClient;

  constructor() {
    this.orderRepository = new OrderRepository();
    this.userServiceClient = new UserServiceClient();
  }

  async createOrder(userId: string, items: OrderItemInput[], requestId: string) {
    logger.info({
      event: 'user_verification_started',
      service: 'order-service',
      requestId,
      userId
    });

    try {
      const userExists = await this.userServiceClient.verifyUser(userId, requestId);
      
      if (!userExists) {
        logger.warn({
          event: 'order_creation_blocked',
          service: 'order-service',
          requestId,
          userId,
          reason: 'user_not_found'
        });
        throw new ApplicationError('USER_NOT_FOUND', `User ${userId} not found`, 404);
      }

      logger.info({
        event: 'user_verification_succeeded',
        service: 'order-service',
        requestId,
        userId
      });
    } catch (error: any) {
      if (error.code === 'USER_NOT_FOUND') {
        throw error;
      }
      logger.error({
        event: 'user_verification_failed',
        service: 'order-service',
        requestId,
        userId,
        errorCode: error.code || 'USER_SERVICE_UNAVAILABLE',
        error: error.message
      });
      
      // Preserve specific error codes from resilience layer (e.g., CIRCUIT_BREAKER_OPEN)
      const status = error.status || 503;
      const code = error.code || 'USER_SERVICE_UNAVAILABLE';
      throw new ApplicationError(code, error.message || 'User service is unavailable', status);
    }

    // Precise decimal calculation using cents to avoid JS floating point errors
    let totalCents = 0;
    for (const item of items) {
      const priceInCents = Math.round(item.unitPrice * 100);
      totalCents += priceInCents * item.quantity;
    }
    const totalAmount = totalCents / 100;

    const order = await this.orderRepository.createOrder(userId, items, totalAmount, requestId);
    return order;
  }

  async getOrderById(id: string) {
    const order = await this.orderRepository.findOrderById(id);
    if (!order) {
      throw new NotFoundError(`Order with id ${id} not found`);
    }
    return order;
  }
}
