import { Request, Response } from 'express';
import { faultEngine } from '../lib/fault-engine';
import { logger } from '../lib/logger';
import { config } from '../config';

export class FaultController {
  public static getAllFaults(req: Request, res: Response) {
    if (config.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Fault simulation disabled in production' });
    }
    const faults = faultEngine.getAllFaults();
    return res.status(200).json(faults);
  }

  public static setFault(req: Request, res: Response) {
    if (config.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Fault simulation disabled in production' });
    }

    try {
      const { id, type, enabled, targetComponent, delayMs, ttlMs } = req.body;
      
      const config = {
        id,
        type,
        enabled,
        targetComponent,
        delayMs,
        expiresAt: ttlMs ? new Date(Date.now() + ttlMs) : undefined
      };

      if (!enabled) {
        faultEngine.disableFault(id);
      } else {
        faultEngine.setFault(config);
      }

      return res.status(200).json(faultEngine.getAllFaults().find(f => f.id === id));
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to set fault');
      return res.status(400).json({ error: error.message });
    }
  }

  public static disableAll(req: Request, res: Response) {
    if (config.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Fault simulation disabled in production' });
    }

    faultEngine.disableAll();
    return res.status(200).json({ message: 'All faults disabled' });
  }
}
