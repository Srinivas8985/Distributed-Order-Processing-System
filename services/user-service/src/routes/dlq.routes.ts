import { Router } from 'express';
import { listDlqEvents, getDlqEvent, replayDlqEvent } from '../controllers/dlq.controller';
import { internalAuth } from '../middleware/internal-auth';

export const dlqRouter = Router();

dlqRouter.use('/internal/dlq', internalAuth);

dlqRouter.get('/internal/dlq', listDlqEvents);
dlqRouter.get('/internal/dlq/:id', getDlqEvent);
dlqRouter.post('/internal/dlq/:id/replay', replayDlqEvent);
