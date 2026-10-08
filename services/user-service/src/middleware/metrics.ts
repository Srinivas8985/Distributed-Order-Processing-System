import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestsTotal } from '../lib/metrics';

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/metrics') {
    return next();
  }
  
  const endTimer = httpRequestDuration.startTimer();
  
  res.on('finish', () => {
    // Determine route pattern if available, otherwise use base path to avoid high cardinality
    const routePattern = req.route?.path || (req.baseUrl + req.path).split('?')[0];
    
    httpRequestsTotal.inc({ method: req.method, route: routePattern, code: res.statusCode });
    endTimer({ method: req.method, route: routePattern, code: res.statusCode });
  });
  
  next();
};
