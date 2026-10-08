import { Router } from 'express';
import { register } from '../lib/metrics';

export const metricsRouter = Router();

metricsRouter.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});
