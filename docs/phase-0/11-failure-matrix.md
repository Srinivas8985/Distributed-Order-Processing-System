# Phase 0 — Failure Matrix

## Complete Failure Scenario Analysis

Each scenario defines the failure condition, expected system behavior, database state, HTTP response, logs, event state, and recovery path.

---

### Scenario 1: User Service Healthy (Happy Path)

| Aspect | Detail |
|--------|--------|
| **Failure** | None — normal operation |
| **System Behavior** | Order Service calls User Service → 200 OK. Order created. Outbox event created. Worker publishes. Consumer creates activity. |
| **Database State** | Order DB: order + items + outbox (PUBLISHED) + idempotency key. User DB: activity_history + processed_events. |
| **HTTP Response** | `201 Created` with order data |
| **Logs** | `info: Order created successfully`, `info: Event published`, `info: Activity recorded` |
| **Event State** | PENDING → PROCESSING → PUBLISHED |
| **Recovery** | N/A |

---

### Scenario 2: User Service Unavailable (Connection Refused)

| Aspect | Detail |
|--------|--------|
| **Failure** | User Service process is down (ECONNREFUSED) |
| **System Behavior** | Order Service retries 3 times with exponential backoff. All retries fail. Circuit breaker failure count increases. |
| **Database State** | Order DB: no order, no outbox event, no idempotency key consumed (transaction never started). |
| **HTTP Response** | `503 Service Unavailable` `{ "error": { "code": "USER_SERVICE_UNAVAILABLE", "retryable": true } }` |
| **Logs** | `warn: User verification failed, retrying (attempt 2/4)` × 3, `error: User Service unavailable after 3 retries` |
| **Event State** | No event created |
| **Recovery** | Client retries with same Idempotency-Key after User Service recovers |

---

### Scenario 3: User Service Timeout

| Aspect | Detail |
|--------|--------|
| **Failure** | User Service accepts connection but does not respond within 3000ms |
| **System Behavior** | Same as Scenario 2 but with ETIMEDOUT instead of ECONNREFUSED |
| **Database State** | Same as Scenario 2 |
| **HTTP Response** | `503 Service Unavailable` with `retryable: true` |
| **Logs** | `warn: User verification timeout (3000ms), retrying` × 3, `error: User Service timeout after 3 retries` |
| **Event State** | No event created |
| **Recovery** | Same as Scenario 2 |

---

### Scenario 4: User Service Returns 503

| Aspect | Detail |
|--------|--------|
| **Failure** | User Service responds with 503 (overloaded or simulated) |
| **System Behavior** | 503 is retryable → Order Service retries 3 times. |
| **Database State** | Same as Scenario 2 |
| **HTTP Response** | `503 Service Unavailable` |
| **Logs** | `warn: User Service returned 503, retrying` × 3 |
| **Event State** | No event created |
| **Recovery** | Same as Scenario 2 |

---

### Scenario 5: User Service Returns 404 (User Not Found)

| Aspect | Detail |
|--------|--------|
| **Failure** | User does not exist |
| **System Behavior** | 404 is NOT retryable. No retries. Immediate failure. Circuit breaker is NOT affected (404 is not a service failure). |
| **Database State** | No order, no outbox event. Idempotency key is NOT consumed. |
| **HTTP Response** | `404 Not Found` `{ "error": { "code": "USER_NOT_FOUND", "retryable": false } }` |
| **Logs** | `info: User not found for order creation, userId=...` |
| **Event State** | No event created |
| **Recovery** | Client creates the user first, then retries order with a new Idempotency-Key |

---

### Scenario 6: Multiple Retries (Partial Recovery)

| Aspect | Detail |
|--------|--------|
| **Failure** | User Service fails on attempts 1 and 2, succeeds on attempt 3 |
| **System Behavior** | Retries work as designed. Order is created on the third attempt. |
| **Database State** | Order + items + outbox event created normally |
| **HTTP Response** | `201 Created` (client unaware of internal retries) |
| **Logs** | `warn: retrying (attempt 2)`, `warn: retrying (attempt 3)`, `info: User verified after 3 attempts`, `info: Order created` |
| **Event State** | PENDING → PUBLISHED (normal) |
| **Recovery** | N/A — system self-healed |

---

### Scenario 7: Circuit Breaker Opens

| Aspect | Detail |
|--------|--------|
| **Failure** | 5+ consecutive failures to User Service |
| **System Behavior** | Circuit breaker transitions to OPEN. Subsequent requests immediately get 503 without calling User Service. After 30s, transitions to HALF-OPEN and tests with one request. |
| **Database State** | No orders created while circuit is OPEN |
| **HTTP Response** | `503 Service Unavailable` `{ "error": { "code": "CIRCUIT_BREAKER_OPEN", "retryable": true } }` |
| **Logs** | `error: Circuit breaker opened`, later: `info: Circuit breaker half-open, testing`, then `info: Circuit breaker closed` or `error: Circuit breaker re-opened` |
| **Event State** | No events created |
| **Recovery** | Automatic — circuit breaker tests recovery after resetTimeout |

---

### Scenario 8: RabbitMQ Unavailable

| Aspect | Detail |
|--------|--------|
| **Failure** | RabbitMQ is down or unreachable |
| **System Behavior** | Order creation still succeeds (Outbox Pattern). Outbox worker fails to publish. Events accumulate as PENDING. |
| **Database State** | Order DB: order + items + outbox (PENDING, increasing attempts) + idempotency key. User DB: no activity record yet. |
| **HTTP Response** | `201 Created` (order creation is NOT affected by RabbitMQ being down) |
| **Logs** | `info: Order created`, `error: Failed to publish outbox event — RabbitMQ unavailable`, `warn: Outbox event retry scheduled` |
| **Event State** | PENDING → PROCESSING → PENDING (retry loop) |
| **Recovery** | When RabbitMQ recovers, outbox worker publishes all pending events. Activity records are created. |

---

### Scenario 9: Outbox Event Remains Pending (Extended)

| Aspect | Detail |
|--------|--------|
| **Failure** | RabbitMQ unavailable for extended period, events exceed max_attempts |
| **System Behavior** | Events transition to FAILED after max_attempts (5) |
| **Database State** | outbox_events with status=FAILED, attempts=5, last_error set |
| **HTTP Response** | Original order creation returned 201 (unaffected) |
| **Logs** | `error: Outbox event exceeded max attempts, marking as FAILED` |
| **Event State** | PENDING → PROCESSING → PENDING → ... → FAILED |
| **Recovery** | Admin uses Event Replay (`POST /admin/events/:id/replay`) after fixing RabbitMQ |

---

### Scenario 10: Outbox Retry Succeeds

| Aspect | Detail |
|--------|--------|
| **Failure** | RabbitMQ temporarily unavailable, recovers before max_attempts |
| **System Behavior** | Event transitions PENDING → PROCESSING → PENDING (failed) → PROCESSING → PUBLISHED |
| **Database State** | outbox_events with status=PUBLISHED, attempts=3 |
| **HTTP Response** | Original 201 unaffected |
| **Logs** | `warn: Outbox publish failed, retry scheduled`, `info: Outbox event published after 3 attempts` |
| **Event State** | PENDING → PUBLISHED (with retries in between) |
| **Recovery** | Automatic |

---

### Scenario 11: Consumer Crashes

| Aspect | Detail |
|--------|--------|
| **Failure** | User Service consumer crashes while processing a message |
| **System Behavior** | No ACK sent. RabbitMQ waits for heartbeat timeout (~60s), then redelivers the message. |
| **Database State** | If crash before COMMIT: User DB unchanged. If crash after COMMIT but before ACK: activity + processed_events exist (consumer-side idempotency handles redelivery). |
| **HTTP Response** | N/A (asynchronous) |
| **Logs** | Consumer logs stop. On restart: `info: Processing redelivered message` |
| **Event State** | Outbox: PUBLISHED (unaffected). Message: redelivered by RabbitMQ. |
| **Recovery** | Automatic — consumer restart processes the message. Idempotency prevents duplicates. |

---

### Scenario 12: Duplicate Event Delivery

| Aspect | Detail |
|--------|--------|
| **Failure** | Same message delivered twice (outbox re-publish or RabbitMQ redelivery) |
| **System Behavior** | Second delivery: consumer checks `processed_events` → eventId found → skip → ACK |
| **Database State** | User DB: one activity_history record (not duplicated), processed_events has the eventId |
| **HTTP Response** | N/A (asynchronous) |
| **Logs** | `info: Duplicate event detected, skipping (eventId=...)` |
| **Event State** | Outbox: PUBLISHED. Message: ACKed on duplicate delivery. |
| **Recovery** | N/A — handled automatically |

---

### Scenario 13: Poison Event (Unparseable/Invalid Message)

| Aspect | Detail |
|--------|--------|
| **Failure** | Message has invalid schema, missing fields, or corrupted data |
| **System Behavior** | Consumer validation fails. Message is nacked without requeue → DLQ. |
| **Database State** | User DB: no activity_history created. No processed_events entry. |
| **HTTP Response** | N/A (asynchronous) |
| **Logs** | `error: Poison message detected — invalid schema, sending to DLQ (eventId=...)` |
| **Event State** | Message in `user.activity.dlq` |
| **Recovery** | Admin inspects DLQ message. If fixable: fix and replay. If not: discard. |

---

### Scenario 14: Dead-Letter Queue (DLQ)

| Aspect | Detail |
|--------|--------|
| **Failure** | Consumer fails to process a message after 3 attempts |
| **System Behavior** | 3rd nack sends message to DLQ via dead-letter exchange. No further automatic processing. |
| **Database State** | User DB: no activity_history. No processed_events entry. |
| **HTTP Response** | N/A (asynchronous) |
| **Logs** | `error: Message sent to DLQ after 3 failed attempts (eventId=...)` |
| **Event State** | Message in `user.activity.dlq`. Outbox: PUBLISHED (outbox doesn't know about consumer failures). |
| **Recovery** | Admin inspects via Reliability Console → fixes root cause → replays event |

---

### Scenario 15: Event Replay

| Aspect | Detail |
|--------|--------|
| **Failure** | Admin replays a FAILED outbox event |
| **System Behavior** | Event reset to PENDING. Outbox worker picks it up. Publishes to RabbitMQ. Consumer processes it. |
| **Database State** | Outbox: FAILED → PENDING → PUBLISHED. User DB: activity_history created (if not already existing). |
| **HTTP Response** | Replay API returns `200 OK` |
| **Logs** | `info: Event replayed by admin (eventId=...)`, `info: Replayed event published`, `info: Activity recorded` |
| **Event State** | FAILED → PENDING → PUBLISHED |
| **Recovery** | Manual (admin-initiated) |

---

### Scenario 16: Duplicate Order Request (Same Idempotency-Key)

| Aspect | Detail |
|--------|--------|
| **Failure** | Client sends same `Idempotency-Key` twice (sequential) |
| **System Behavior** | Second request detects existing key + matching hash → returns cached response |
| **Database State** | One order, one outbox event, one idempotency key (no changes from second request) |
| **HTTP Response** | `200 OK` with original order data (not 201) |
| **Logs** | `info: Idempotent replay for key=abc123` |
| **Event State** | No change (event already PENDING or PUBLISHED from first request) |
| **Recovery** | N/A — working as designed |

---

### Scenario 17: Concurrent Duplicate Order Requests

| Aspect | Detail |
|--------|--------|
| **Failure** | Two requests with same `Idempotency-Key` arrive simultaneously |
| **System Behavior** | First INSERT succeeds. Second INSERT hits UNIQUE constraint violation. Second request waits briefly then returns cached response or 409 "Request in progress". |
| **Database State** | One order, one outbox event, one idempotency key |
| **HTTP Response** | First: `201 Created`. Second: `200 OK` (cached) or `409 Conflict` (if first is still in-flight) |
| **Logs** | `warn: Concurrent idempotency key conflict, key=abc123` |
| **Event State** | No change |
| **Recovery** | If 409: client retries after brief delay |

---

### Scenario 18: Unauthorized Service Request

| Aspect | Detail |
|--------|--------|
| **Failure** | Order Service calls User Service without or with invalid `X-Service-Auth` |
| **System Behavior** | User Service returns 401. 401 is NOT retryable. Order creation fails immediately. |
| **Database State** | No order, no outbox event, no idempotency key consumed |
| **HTTP Response** | `500 Internal Server Error` (auth misconfiguration is a server error, not a client error) |
| **Logs** | `error: Service-to-service authentication failed — check SERVICE_AUTH_TOKEN configuration` |
| **Event State** | No event created |
| **Recovery** | Fix `SERVICE_AUTH_TOKEN` environment variable, restart services |
