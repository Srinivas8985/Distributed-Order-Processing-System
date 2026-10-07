import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerOpenError, CircuitState } from '../src/infrastructure/resilience/circuit-breaker';

describe('CircuitBreaker', () => {
  let time = 1000;
  const mockTimeProvider = () => time;

  const config: CircuitBreakerConfig = {
    failureThreshold: 3,
    openDurationMs: 5000,
    halfOpenMaxRequests: 1,
    successThreshold: 2
  };

  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    time = 1000;
    circuitBreaker = new CircuitBreaker('test-circuit', config, mockTimeProvider);
  });

  it('starts in CLOSED state', () => {
    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('allows execution when CLOSED and succeeds', async () => {
    const action = vi.fn().mockResolvedValue('success');
    const result = await circuitBreaker.execute(action);
    
    expect(result).toBe('success');
    expect(action).toHaveBeenCalled();
    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('opens circuit after reaching failure threshold', async () => {
    const action = vi.fn().mockRejectedValue(new Error('fail'));
    
    // Fail 1
    await expect(circuitBreaker.execute(action)).rejects.toThrow('fail');
    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    
    // Fail 2
    await expect(circuitBreaker.execute(action)).rejects.toThrow('fail');
    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    
    // Fail 3 -> OPENS
    await expect(circuitBreaker.execute(action)).rejects.toThrow('fail');
    expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
  });

  it('does not count non-circuit failures', async () => {
    const error = new Error('not found') as any;
    error.isCircuitFailure = false;
    
    const action = vi.fn().mockRejectedValue(error);
    
    // Fail multiple times
    await expect(circuitBreaker.execute(action)).rejects.toThrow('not found');
    await expect(circuitBreaker.execute(action)).rejects.toThrow('not found');
    await expect(circuitBreaker.execute(action)).rejects.toThrow('not found');
    await expect(circuitBreaker.execute(action)).rejects.toThrow('not found');
    
    // Still closed because they don't count
    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('fails fast when OPEN', async () => {
    const action = vi.fn().mockRejectedValue(new Error('fail'));
    
    await expect(circuitBreaker.execute(action)).rejects.toThrow();
    await expect(circuitBreaker.execute(action)).rejects.toThrow();
    await expect(circuitBreaker.execute(action)).rejects.toThrow(); // Now OPEN
    
    // Execute when OPEN
    const action2 = vi.fn().mockResolvedValue('success');
    await expect(circuitBreaker.execute(action2)).rejects.toThrow(CircuitBreakerOpenError);
    expect(action2).not.toHaveBeenCalled();
  });

  it('transitions to HALF_OPEN after openDurationMs', async () => {
    const action = vi.fn().mockRejectedValue(new Error('fail'));
    
    await expect(circuitBreaker.execute(action)).rejects.toThrow();
    await expect(circuitBreaker.execute(action)).rejects.toThrow();
    await expect(circuitBreaker.execute(action)).rejects.toThrow(); // OPEN
    
    expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    
    // Move time forward
    time += config.openDurationMs + 100;
    
    expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
  });

  it('re-opens if probe fails during HALF_OPEN', async () => {
    const action = vi.fn().mockRejectedValue(new Error('fail'));
    
    // Trigger open
    await expect(circuitBreaker.execute(action)).rejects.toThrow();
    await expect(circuitBreaker.execute(action)).rejects.toThrow();
    await expect(circuitBreaker.execute(action)).rejects.toThrow();
    
    time += config.openDurationMs + 100;
    expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    
    // Probe fails
    await expect(circuitBreaker.execute(action)).rejects.toThrow('fail');
    expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
  });

  it('closes after sufficient successes during HALF_OPEN', async () => {
    const failAction = vi.fn().mockRejectedValue(new Error('fail'));
    const successAction = vi.fn().mockResolvedValue('success');
    
    // Increase allowed requests for this test just to allow 2 successes
    (circuitBreaker as any).config.halfOpenMaxRequests = 2;
    
    // Trigger open
    await expect(circuitBreaker.execute(failAction)).rejects.toThrow();
    await expect(circuitBreaker.execute(failAction)).rejects.toThrow();
    await expect(circuitBreaker.execute(failAction)).rejects.toThrow();
    
    time += config.openDurationMs + 100;
    expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    
    // Probe 1 succeeds
    await expect(circuitBreaker.execute(successAction)).resolves.toBe('success');
    // We configured successThreshold to 2, so it should still be HALF_OPEN
    expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    
    // Probe 2 succeeds
    await expect(circuitBreaker.execute(successAction)).resolves.toBe('success');
    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
  });
});
