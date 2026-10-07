import { logger } from '../../lib/logger';

export interface RetryConfig {
  maxAttempts: number; // total attempts (1 initial + N retries)
  baseDelayMs: number;
  maxDelayMs: number;
  jitterVariance: number; // e.g., 0.2 for 20%
}

export class Retry {
  constructor(
    private readonly name: string,
    private readonly config: RetryConfig,
    private readonly delayProvider: (ms: number) => Promise<void> = (ms) => new Promise(resolve => setTimeout(resolve, ms))
  ) {}

  async execute<T>(action: (attempt: number) => Promise<T>): Promise<T> {
    let attempt = 1;

    while (true) {
      try {
        return await action(attempt);
      } catch (error: any) {
        // If error is not retryable, throw immediately
        if (error.retryable === false) {
          throw error;
        }

        if (attempt >= this.config.maxAttempts) {
          logger.warn({
            event: `${this.name}_retry_exhausted`,
            attempts: attempt,
            error: error.message
          });
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        logger.warn({
          event: `${this.name}_retry`,
          attempt: attempt + 1,
          maxAttempts: this.config.maxAttempts,
          delayMs: Math.round(delay),
          error: error.message
        });

        await this.delayProvider(delay);
        attempt++;
      }
    }
  }

  private calculateDelay(retryCount: number): number {
    // retryCount here is how many times we've already tried and failed.
    // So for the 1st retry (attempt 2), retryCount=1.
    const exponent = retryCount - 1;
    const baseWait = this.config.baseDelayMs * Math.pow(2, exponent);
    const cappedWait = Math.min(baseWait, this.config.maxDelayMs);
    
    // Add jitter
    const minJitter = 1 - this.config.jitterVariance;
    const maxJitter = 1 + this.config.jitterVariance;
    const jitterMultiplier = minJitter + Math.random() * (maxJitter - minJitter);
    
    return cappedWait * jitterMultiplier;
  }
}
