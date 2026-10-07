import { logger } from '../../lib/logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  openDurationMs: number;
  halfOpenMaxRequests: number;
  successThreshold: number;
}

export class CircuitBreakerOpenError extends Error {
  constructor() {
    super('Circuit breaker is OPEN');
    this.name = 'CircuitBreakerOpenError';
    (this as any).code = 'CIRCUIT_BREAKER_OPEN';
    (this as any).status = 503;
    (this as any).retryable = false; // Must be false so Retry fails fast!
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private halfOpenRequests: number = 0;
  private nextAttemptMs: number = 0;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig,
    private readonly timeProvider: () => number = Date.now
  ) {}

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN && this.timeProvider() >= this.nextAttemptMs) {
      this.transitionToHalfOpen();
    }
    return this.state;
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitState.OPEN) {
      logger.warn({
        event: 'circuit_breaker_rejected',
        circuit: this.name,
        circuitState: this.state
      });
      throw new CircuitBreakerOpenError();
    }

    if (currentState === CircuitState.HALF_OPEN) {
      if (this.halfOpenRequests >= this.config.halfOpenMaxRequests) {
        // If we've reached the max concurrent test requests, reject others to avoid overwhelming
        logger.warn({
          event: 'circuit_breaker_rejected',
          circuit: this.name,
          circuitState: this.state,
          reason: 'half_open_capacity_reached'
        });
        throw new CircuitBreakerOpenError();
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error: any) {
      // Only count if it's considered a circuit failure
      // (The caller must throw an error marked with `isCircuitFailure = true` or we just count all thrown errors except specific ones)
      if (error.isCircuitFailure !== false) {
        this.onFailure();
      } else {
        // It's a non-circuit failure (like 404, 401), so it counts as a successful circuit operation
        this.onSuccess();
      }
      throw error;
    }
  }

  private onSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failures = 0;
    }
  }

  private onFailure() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED) {
      this.failures++;
      if (this.failures >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    }
  }

  private transitionToOpen() {
    this.state = CircuitState.OPEN;
    this.nextAttemptMs = this.timeProvider() + this.config.openDurationMs;
    logger.error({
      event: 'circuit_breaker_opened',
      circuit: this.name,
      failures: this.failures
    });
  }

  private transitionToHalfOpen() {
    this.state = CircuitState.HALF_OPEN;
    this.halfOpenRequests = 0;
    this.successes = 0;
    logger.info({
      event: 'circuit_breaker_half_open',
      circuit: this.name
    });
  }

  private transitionToClosed() {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    logger.info({
      event: 'circuit_breaker_closed',
      circuit: this.name
    });
  }
}
