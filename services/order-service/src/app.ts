import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requestIdMiddleware } from './middleware/request-id';
import { loggerMiddleware } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { healthRouter } from './routes/health.routes';
import { orderRouter } from './routes/order.routes';
import { outboxRouter } from './routes/outbox.routes';
import { internalAuth } from './middleware/internal-auth';
import { faultRouter } from './routes/fault.routes';
import { faultInjector } from './middleware/fault-injector';
import { metricsMiddleware } from './middleware/metrics';
import { metricsRouter } from './routes/metrics.routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/health') || req.path.startsWith('/ready') || req.path.startsWith('/internal') || req.path.startsWith('/metrics'),
}));

app.use(requestIdMiddleware);
app.use(metricsMiddleware);
app.use(loggerMiddleware);

app.use(healthRouter);
app.use(metricsRouter);
app.use(faultInjector('api'));
app.use(orderRouter);
app.use('/internal/outbox', internalAuth, outboxRouter);
app.use('/internal/faults', faultRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
