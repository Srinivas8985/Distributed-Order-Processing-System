# Phase 0 — Resilience Design

## 1. Timeout

### What
A maximum duration that Order Service waits for a response from User Service before giving up.

### Why
Without a timeout, a hanging User Service would cause Order Service threads/connections to accumulate indefinitely, eventually exhausting resources and making Order Service itself unavailable (cascading failure).

### Design Values

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `USER_SERVICE_TIMEOUT_MS` | `3000` (3 seconds) | User verification is a simple DB lookup; 3s is generous. Longer than typical response (~50ms) but short enough to fail fast. |

### Behavior
- If User Service does not respond within 3000ms, the HTTP client aborts the request.
- The error is classified as `retryable` (timeout is transient).
- Timeout is measured from request start to first byte of response.

---

## 2. Retry

### What
Automatic re-attempt of a failed inter-service call.

### Why
Transient failures (network blip, User Service restarting, temporary overload) are common in distributed systems. A single retry often succeeds without requiring the client to re-submit.

### Design Values

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `MAX_RETRIES` | `3` | Enough to survive brief transient failures; not so many that we amplify load |
| `INITIAL_BACKOFF_MS` | `1000` | 1 second base delay |
| `BACKOFF_MULTIPLIER` | `2` | Exponential: 1s, 2s, 4s |
| `MAX_BACKOFF_MS` | `5000` | Cap prevents excessively long waits |
| `JITTER` | `±20%` | Prevents synchronized retry storms |

### Retry Schedule

| Attempt | Delay (before attempt) | Total elapsed |
|---------|----------------------|---------------|
| 1st (original) | 0ms | 0ms |
| 2nd (retry 1) | ~1000ms ± jitter | ~1s |
| 3rd (retry 2) | ~2000ms ± jitter | ~3s |
| 4th (retry 3) | ~4000ms ± jitter | ~7s |
| Give up | — | ~7s + timeouts |

### Worst-case latency
With 3s timeout per attempt and 3 retries: `4 × 3s + 1s + 2s + 4s = 19s`. This is acceptable for an order-creation endpoint where reliability matters more than sub-second latency.

---

## 3. Retryable vs Non-Retryable Errors

| Error | Retryable | Rationale |
|-------|-----------|-----------|
| Timeout (ETIMEDOUT) | ✅ Yes | Transient — service may recover |
| Connection refused (ECONNREFUSED) | ✅ Yes | Service may be restarting |
| 503 Service Unavailable | ✅ Yes | Server signals temporary overload |
| 429 Too Many Requests | ✅ Yes | Rate limited, try again after backoff |
| 500 Internal Server Error | ✅ Yes | May be transient |
| 400 Bad Request | ❌ No | Client error — retrying won't help |
| 401 Unauthorized | ❌ No | Auth misconfiguration — retrying won't help |
| 404 Not Found | ❌ No | User doesn't exist — retrying won't change this |
| Network error (DNS) | ✅ Yes | DNS may recover |

### When Retries Should NOT Happen
1. **Client errors (4xx except 429):** The request is invalid; resending produces the same error.
2. **Business logic failures:** User not found (404) is not transient.
3. **Circuit breaker open:** Retries are suppressed — the circuit breaker handles recovery.
4. **Non-idempotent side effects already committed:** Not applicable here because we retry BEFORE creating the order.

---

## 4. Exponential Backoff

### Why It's Needed
If 100 clients simultaneously retry after 1 second, all 100 retries hit User Service at the same instant — a **retry storm**. This can overload a recovering service and prevent it from ever recovering (thundering herd problem).

### How Exponential Backoff Helps
Each successive retry waits longer: 1s → 2s → 4s. This spreads retries over time.

### Why Jitter Is Added
Even with exponential backoff, if all clients started at the same time, they'd still retry at the same times (1s, 3s, 7s). Adding ±20% random jitter desynchronizes them.

### Implementation
```
delay = min(INITIAL_BACKOFF_MS × BACKOFF_MULTIPLIER^attempt, MAX_BACKOFF_MS)
delay = delay × (0.8 + Math.random() × 0.4)  // ±20% jitter
```

---

## 5. Circuit Breaker

### What
A state machine that monitors failures to an external dependency. When failures exceed a threshold, the circuit "opens" and immediately rejects requests without attempting the call, giving the downstream service time to recover.

### Why
- **Prevents resource exhaustion:** Without a circuit breaker, every request to a dead User Service wastes a timeout period (3s) and a thread/connection.
- **Enables fast failure:** Clients get an immediate 503 instead of waiting 19s for all retries to timeout.
- **Allows recovery:** The "half-open" state periodically tests if the service has recovered.

### States

```
     ┌─────────┐  failures >= threshold   ┌────────┐
     │ CLOSED  │ ───────────────────────> │  OPEN  │
     │ (normal)│                          │ (fail  │
     └────┬────┘                          │  fast) │
          ^                               └───┬────┘
          │                                   │
          │  probe succeeds                   │ after resetTimeout
          │                                   v
     ┌────┴──────┐                      ┌──────────┐
     │           │ <─────────────────── │ HALF-OPEN│
     │  CLOSED   │   probe succeeds     │ (test 1  │
     └───────────┘                      │  request)│
                                        └──────────┘
                                            │
                                            │ probe fails
                                            v
                                        ┌────────┐
                                        │  OPEN  │
                                        └────────┘
```

### Design Values

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `CB_FAILURE_THRESHOLD` | `5` | 5 consecutive failures before opening |
| `CB_RESET_TIMEOUT_MS` | `30000` (30s) | Time in OPEN state before trying HALF-OPEN |
| `CB_HALF_OPEN_REQUESTS` | `1` | Number of test requests in HALF-OPEN |
| `CB_SUCCESS_THRESHOLD` | `2` | Consecutive successes in HALF-OPEN to close |

### Failure Counting Rules
- Only **retryable errors** (timeout, 503, connection refused) count as failures.
- 404 (user not found) does NOT count as a failure — it's a valid response.
- Successful responses reset the failure counter.

### Circuit Breaker + Order Service Behavior

| CB State | Order Service Behavior |
|----------|----------------------|
| CLOSED | Normal: call User Service with timeout + retry |
| OPEN | Immediate: return 503 to client, skip User Service call entirely |
| HALF-OPEN | Send one test request to User Service; if success → CLOSED; if fail → OPEN |

### Exposing Circuit Breaker State
The circuit breaker state is exposed via `GET /admin/metrics` so the Reliability Console can display it. This is purely informational — the console does not control the circuit breaker.

---

## 6. Resilience Stack Summary

Requests flow through the resilience stack in this order:

```
Client Request
     │
     v
[Idempotency Check]  ← cached response if duplicate
     │
     v
[Circuit Breaker]    ← 503 immediately if OPEN
     │
     v
[HTTP Call + Timeout] ← 3s timeout
     │
     v
[Retry with Backoff] ← up to 3 retries, exponential + jitter
     │
     v
[Response / Error]
```

The key insight is that each layer has a different responsibility:
- **Idempotency:** Prevents duplicate side effects from client retries
- **Circuit breaker:** Prevents calling a known-dead service
- **Timeout:** Prevents indefinite waiting
- **Retry:** Overcomes transient failures
- **Backoff:** Prevents retry storms
