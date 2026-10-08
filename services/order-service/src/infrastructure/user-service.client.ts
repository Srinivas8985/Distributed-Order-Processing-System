import { config } from '../config';
import { ResiliencePolicy } from './resilience/resilience-policy';
import { logger } from '../lib/logger';
import { externalRequestCounter, timeoutCounter } from '../lib/metrics';

export class UserServiceClient {
  private baseUrl: string;
  private token: string;
  private resiliencePolicy: ResiliencePolicy;

  constructor() {
    this.baseUrl = config.USER_SERVICE_URL;
    this.token = config.INTERNAL_SERVICE_TOKEN;

    this.resiliencePolicy = new ResiliencePolicy('user-service-client', {
      retry: {
        maxAttempts: config.USER_SERVICE_MAX_ATTEMPTS,
        baseDelayMs: config.USER_SERVICE_RETRY_BASE_DELAY_MS,
        maxDelayMs: config.USER_SERVICE_RETRY_MAX_DELAY_MS,
        jitterVariance: 0.2
      },
      circuitBreaker: {
        failureThreshold: config.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
        openDurationMs: config.CIRCUIT_BREAKER_OPEN_DURATION_MS,
        halfOpenMaxRequests: config.CIRCUIT_BREAKER_HALF_OPEN_MAX_REQUESTS,
        successThreshold: config.CIRCUIT_BREAKER_SUCCESS_THRESHOLD
      }
    });
  }

  async verifyUser(userId: string, requestId: string): Promise<boolean> {
    return this.resiliencePolicy.execute(async (attempt) => {
      try {
        const signal = AbortSignal.timeout(config.USER_SERVICE_TIMEOUT_MS);
        
        const response = await fetch(`${this.baseUrl}/internal/users/${userId}/verify`, {
          method: 'GET',
          headers: {
            'X-Service-Auth': this.token,
            'X-Request-ID': requestId,
            'X-Correlation-ID': requestId,
            'Accept': 'application/json'
          },
          signal
        });

        externalRequestCounter.inc({ service: 'order-service', target: 'user-service', status: response.status.toString() });

        if (response.status === 200) {
          return true;
        }

        if (response.status === 404) {
          return false;
        }

        const errorBody = await response.json().catch(() => ({}));
        const errorCode = errorBody?.error?.code || 'USER_SERVICE_ERROR';
        
        const error = new Error(`User verification failed: ${errorCode}`) as any;
        error.status = response.status;
        error.code = errorCode;
        
        // Error classification
        if ([400, 401, 403].includes(response.status)) {
          error.retryable = false;
          error.isCircuitFailure = false; // Client errors don't trigger circuit breaker
        } else {
          error.retryable = true; // 500, 503, 429 are retryable
          error.isCircuitFailure = true;
        }
        
        throw error;
      } catch (err: any) {
        // Handle AbortSignal timeout
        if (err.name === 'TimeoutError' || err.code === 'UND_ERR_HEADERS_TIMEOUT') {
          logger.warn({
            event: 'user_verification_timeout',
            requestId,
            userId,
            attempt,
            durationMs: config.USER_SERVICE_TIMEOUT_MS
          });
          const timeoutErr = new Error('User service verification timed out') as any;
          timeoutErr.status = 503;
          timeoutErr.code = 'USER_SERVICE_TIMEOUT';
          timeoutErr.retryable = true;
          timeoutErr.isCircuitFailure = true;
          
          timeoutCounter.inc({ service: 'order-service', target: 'user-service' });
          externalRequestCounter.inc({ service: 'order-service', target: 'user-service', status: 'timeout' });
          
          throw timeoutErr;
        }
        
        // Handle network-level errors (e.g. connection refused)
        if (err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED' || !err.status) {
          logger.warn({
            event: 'user_verification_attempt_failed',
            requestId,
            userId,
            attempt,
            errorCode: 'USER_SERVICE_UNAVAILABLE'
          });
          const networkErr = new Error('User service is unavailable') as any;
          networkErr.status = 503;
          networkErr.code = 'USER_SERVICE_UNAVAILABLE';
          networkErr.retryable = true;
          networkErr.isCircuitFailure = true;
          
          externalRequestCounter.inc({ service: 'order-service', target: 'user-service', status: 'unavailable' });
          
          throw networkErr;
        }
        
        logger.warn({
          event: 'user_verification_attempt_failed',
          requestId,
          userId,
          attempt,
          errorCode: err.code
        });

        throw err;
      }
    });
  }
}
