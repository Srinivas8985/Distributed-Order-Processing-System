import { Router } from 'express';
import { getOutboxStats, getOutboxEvents } from '../controllers/outbox.controller';

export const outboxRouter = Router();

outboxRouter.get('/', getOutboxEvents);
outboxRouter.get('/stats', getOutboxStats);
