import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Retry, RetryConfig } from '../src/infrastructure/resilience/retry';

describe('Retry', () => {
  const mockDelayProvider = vi.fn().mockResolvedValue(undefined);
  
  const config: RetryConfig = {
    maxAttempts: 4, // 1 initial + 3 retries
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    jitterVariance: 0.2
  };

  let retry: Retry;

  beforeEach(() => {
    vi.clearAllMocks();
    retry = new Retry('test-retry', config, mockDelayProvider);
  });

  it('succeeds on first attempt without delay', async () => {
    const action = vi.fn().mockResolvedValue('success');
    
    const result = await retry.execute(action);
    
    expect(result).toBe('success');
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(1);
    expect(mockDelayProvider).not.toHaveBeenCalled();
  });

  it('retries on transient failure and succeeds later', async () => {
    const action = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success');
      
    const result = await retry.execute(action);
    
    expect(result).toBe('success');
    expect(action).toHaveBeenCalledTimes(3);
    expect(mockDelayProvider).toHaveBeenCalledTimes(2);
  });

  it('throws error immediately if not retryable', async () => {
    const error = new Error('auth failed') as any;
    error.retryable = false;
    
    const action = vi.fn().mockRejectedValue(error);
    
    await expect(retry.execute(action)).rejects.toThrow('auth failed');
    expect(action).toHaveBeenCalledTimes(1);
    expect(mockDelayProvider).not.toHaveBeenCalled();
  });

  it('exhausts retries and throws the final error', async () => {
    const action = vi.fn().mockRejectedValue(new Error('timeout'));
    
    await expect(retry.execute(action)).rejects.toThrow('timeout');
    expect(action).toHaveBeenCalledTimes(config.maxAttempts);
    expect(mockDelayProvider).toHaveBeenCalledTimes(config.maxAttempts - 1);
  });

  it('applies exponential backoff and max bounds', async () => {
    // we want to spy on the calculateDelay internally, or we can check the arguments passed to mockDelayProvider
    const action = vi.fn().mockRejectedValue(new Error('fail'));
    
    await expect(retry.execute(action)).rejects.toThrow('fail');
    
    expect(mockDelayProvider).toHaveBeenCalledTimes(3);
    
    // First delay: base=1000, jitter +/- 20% (800 - 1200)
    const delay1 = mockDelayProvider.mock.calls[0][0];
    expect(delay1).toBeGreaterThanOrEqual(800);
    expect(delay1).toBeLessThanOrEqual(1200);
    
    // Second delay: base=2000, jitter +/- 20% (1600 - 2400)
    const delay2 = mockDelayProvider.mock.calls[1][0];
    expect(delay2).toBeGreaterThanOrEqual(1600);
    expect(delay2).toBeLessThanOrEqual(2400);
    
    // Third delay: base=4000, jitter +/- 20% (3200 - 4800)
    const delay3 = mockDelayProvider.mock.calls[2][0];
    expect(delay3).toBeGreaterThanOrEqual(3200);
    expect(delay3).toBeLessThanOrEqual(4800);
  });
  
  it('respects maxDelay bound', async () => {
    // base 3000, multiplier 2, max 5000
    const highBaseConfig = { ...config, baseDelayMs: 3000 };
    retry = new Retry('test-retry', highBaseConfig, mockDelayProvider);
    
    const action = vi.fn().mockRejectedValue(new Error('fail'));
    
    await expect(retry.execute(action)).rejects.toThrow();
    
    // attempt 1 fails -> delay base 3000 -> jitter 2400-3600
    // attempt 2 fails -> delay base 6000 -> capped at 5000 -> jitter 4000-6000
    const delay2 = mockDelayProvider.mock.calls[1][0];
    expect(delay2).toBeLessThanOrEqual(6000); // 5000 * 1.2
  });
});
