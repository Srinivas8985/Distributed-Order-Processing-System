import { logger } from './logger';
import { config } from '../config';

export type FaultType = 'delay' | 'error_500' | 'unavailable' | 'event_processing_failure' | 'outbox_publication_failure';

export interface FaultConfig {
  id: string;
  type: FaultType;
  enabled: boolean;
  targetComponent: string;
  delayMs?: number;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

class FaultEngine {
  private faults: Map<string, FaultConfig> = new Map();

  constructor() {
    if (config.NODE_ENV === 'production') {
      logger.warn('FaultEngine: Initialization blocked in production environment.');
    }
  }

  private isSafeEnvironment(): boolean {
    return config.NODE_ENV !== 'production';
  }

  public getActiveFaults(): FaultConfig[] {
    this.cleanupExpiredFaults();
    return Array.from(this.faults.values()).filter(f => f.enabled);
  }

  public getAllFaults(): FaultConfig[] {
    this.cleanupExpiredFaults();
    return Array.from(this.faults.values());
  }

  public setFault(config: Omit<FaultConfig, 'createdAt' | 'updatedAt'>): FaultConfig {
    if (!this.isSafeEnvironment()) {
      throw new Error('Fault simulation is not allowed in this environment');
    }

    const existing = this.faults.get(config.id);
    const now = new Date();
    
    const newFault: FaultConfig = {
      ...config,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    this.faults.set(config.id, newFault);

    logger.info({
      event: 'fault_simulation_enabled',
      faultId: config.id,
      type: config.type,
      targetComponent: config.targetComponent,
      delayMs: config.delayMs,
      expiresAt: config.expiresAt
    }, `Fault simulation enabled: ${config.id}`);

    return newFault;
  }

  public disableFault(id: string): boolean {
    const fault = this.faults.get(id);
    if (fault && fault.enabled) {
      fault.enabled = false;
      fault.updatedAt = new Date();
      logger.info({
        event: 'fault_simulation_disabled',
        faultId: id
      }, `Fault simulation disabled: ${id}`);
      return true;
    }
    return false;
  }

  public disableAll(): void {
    for (const [id, fault] of this.faults.entries()) {
      if (fault.enabled) {
        this.disableFault(id);
      }
    }
  }

  public async evaluateFaultsByComponent(targetComponent: string, reqId?: string): Promise<void> {
    if (!this.isSafeEnvironment()) return;
    this.cleanupExpiredFaults();

    for (const fault of this.faults.values()) {
      if (fault.enabled && fault.targetComponent === targetComponent) {
        logger.warn({
          event: 'fault_simulation_triggered',
          faultId: fault.id,
          type: fault.type,
          requestId: reqId
        }, `Triggering simulated fault: ${fault.id}`);

        if (fault.type === 'delay' && fault.delayMs) {
          await new Promise(resolve => setTimeout(resolve, fault.delayMs));
        } else if (fault.type === 'error_500') {
          throw new Error(`[SIMULATED_FAULT] Forced 500 error for ${fault.id}`);
        } else if (fault.type === 'unavailable') {
          throw new Error(`[SIMULATED_FAULT] Service unavailable for ${fault.id}`);
        } else if (fault.type === 'event_processing_failure') {
          throw new Error(`[SIMULATED_FAULT] Event processing failure for ${fault.id}`);
        } else if (fault.type === 'outbox_publication_failure') {
          throw new Error(`[SIMULATED_FAULT] Outbox publication failure for ${fault.id}`);
        }
      }
    }
  }

  private cleanupExpiredFaults(): void {
    const now = new Date();
    for (const [id, fault] of this.faults.entries()) {
      if (fault.enabled && fault.expiresAt && fault.expiresAt < now) {
        fault.enabled = false;
        fault.updatedAt = now;
        logger.info({
          event: 'fault_simulation_expired',
          faultId: id
        }, `Fault simulation expired automatically: ${id}`);
      }
    }
  }
}

export const faultEngine = new FaultEngine();
