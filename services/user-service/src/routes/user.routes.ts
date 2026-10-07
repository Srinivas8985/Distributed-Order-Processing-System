import { Router } from 'express';
import { createUser, getUser, verifyUser } from '../controllers/user.controller';
import { validate } from '../middleware/validate';
import { createUserSchema, userIdSchema } from '../schemas/user.schema';
import { internalAuth } from '../middleware/internal-auth';

export const userRouter = Router();

userRouter.post('/users', validate(createUserSchema), createUser);
userRouter.get('/users/:id', validate(userIdSchema), getUser);
userRouter.get('/internal/users/:id/verify', validate(userIdSchema), internalAuth, verifyUser);
