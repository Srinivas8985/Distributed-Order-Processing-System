import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { logger } from '../lib/logger';

const userService = new UserService();

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name } = req.body;
    const user = await userService.createUser(email, name);

    logger.info({
      event: 'user_created',
      requestId: req.id,
      userId: user.id
    });

    res.status(201).json(user);
  } catch (error) {
    logger.warn({
      event: 'user_request_failed',
      requestId: req.id,
      errorCode: (error as any).code || 'INTERNAL_ERROR'
    });
    next(error);
  }
};

export const getUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(id as string);

    logger.info({
      event: 'user_fetched',
      requestId: req.id,
      userId: user.id
    });

    res.status(200).json(user);
  } catch (error) {
    logger.warn({
      event: 'user_request_failed',
      requestId: req.id,
      errorCode: (error as any).code || 'INTERNAL_ERROR'
    });
    next(error);
  }
};

export const verifyUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    logger.info({
      event: 'internal_user_verification_started',
      requestId: req.id,
      userId: id
    });

    const user = await userService.getUserById(id as string);

    logger.info({
      event: 'internal_user_verification_succeeded',
      requestId: req.id,
      userId: user.id
    });

    res.status(200).json({
      id: user.id,
      email: user.email,
      name: user.name,
      verified: true
    });
  } catch (error) {
    logger.warn({
      event: 'internal_user_verification_failed',
      requestId: req.id,
      errorCode: (error as any).code || 'INTERNAL_ERROR'
    });
    next(error);
  }
};
