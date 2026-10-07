import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerOpenError } from './circuit-breaker';
import { Retry, RetryConfig } from './retry';

export interface ResilienceConfig {
  circuitBreaker: CircuitBreakerConfig;
  retry: RetryConfig;
}

export class ResiliencePolicy {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retry: Retry;

  constructor(
    private readonly name: string,
    private readonly config: ResilienceConfig
  ) {
    this.circuitBreaker = new CircuitBreaker(name, config.circuitBreaker);
    this.retry = new Retry(name, config.retry);
  }

  async execute<T>(action: (attempt: number) => Promise<T>): Promise<T> {
    // Retry wraps CircuitBreaker wraps Action
    return this.retry.execute(async (attempt) => {
      return this.circuitBreaker.execute(async () => {
        return action(attempt);
      });
    });
  }
}
