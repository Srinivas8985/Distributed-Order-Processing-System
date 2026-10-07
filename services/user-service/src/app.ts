import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requestIdMiddleware } from './middleware/request-id';
import { loggerMiddleware } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { healthRouter } from './routes/health.routes';
import { userRouter } from './routes/user.routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(requestIdMiddleware);
app.use(loggerMiddleware);

app.use(healthRouter);
app.use(userRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
