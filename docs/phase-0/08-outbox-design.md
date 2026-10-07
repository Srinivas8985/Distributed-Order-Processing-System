# Phase 0 — Outbox Pattern Design

## 1. The Problem

When Order Service creates an order AND publishes an ORDER_CREATED event, two systems are involved: PostgreSQL (database) and RabbitMQ (message broker). Without coordination:

| Scenario | Result |
|----------|--------|
| DB commit succeeds, RabbitMQ publish fails | Order exists, but no event → activity never recorded (data loss) |
| RabbitMQ publish succeeds, DB commit fails | Event published, but no order → phantom event |
| Both succeed | Happy path |

This is the **dual-write problem**: writing to two systems without a distributed transaction can leave them inconsistent.

## 2. The Solution: Outbox Pattern

Instead of publishing directly to RabbitMQ, we write the event to an `outbox_events` table in the **same database** as the order, within the **same transaction**.

```
BEGIN TRANSACTION
  INSERT INTO orders (...)
  INSERT INTO order_items (...)
  INSERT INTO outbox_events (event_type, payload, status='PENDING', ...)
  INSERT INTO idempotency_keys (...)
COMMIT
```

**Guarantee:** If the order exists, the outbox event exists. If the transaction fails, neither exists. Single-database ACID transactions ensure atomicity.

A separate **Outbox Worker** then polls the `outbox_events` table and publishes events to RabbitMQ.

## 3. Outbox Worker Design

### Polling Strategy

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Poll interval | `5000ms` (5 seconds) | Balance between latency and database load |
| Batch size | `10` | Process multiple events per poll cycle |
| Lock strategy | `UPDATE ... SET status='PROCESSING' WHERE status='PENDING' RETURNING *` | Prevents duplicate pickup by concurrent workers |

### Worker Flow

```
loop:
  1. SELECT and lock: 
     UPDATE outbox_events 
     SET status = 'PROCESSING'
     WHERE status = 'PENDING' 
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     ORDER BY created_at ASC
     LIMIT 10
     RETURNING *

  2. For each event:
     a. Build RabbitMQ message from event payload
     b. Publish to exchange 'order.events' with routing key 'order.created'
     c. Wait for publisher confirm (timeout: 5000ms)
     
     d. If publish confirmed:
        UPDATE outbox_events 
        SET status = 'PUBLISHED', 
            published_at = NOW(), 
            attempts = attempts + 1
        WHERE id = event.id
     
     e. If publish failed:
        attempts = attempts + 1
        IF attempts >= max_attempts:
          UPDATE outbox_events SET status = 'FAILED', last_error = error.message
        ELSE:
          next_retry = NOW() + (5s × 2^attempts)  // exponential backoff
          UPDATE outbox_events SET status = 'PENDING', next_retry_at = next_retry, last_error = error.message
  
  3. Sleep poll_interval
  4. goto loop
```

### Why In-Process (Not a Separate Service)

The outbox worker runs as a background process within Order Service (using `setInterval`), not as a separate microservice.

**Rationale:**
- Simplicity: No additional container/deployment
- Shared database connection: Already has access to Order DB
- Acceptable for single-instance deployment (this project)
- A separate worker service would be needed for horizontal scaling (out of scope)

**Trade-off:** If Order Service crashes, the worker stops. Events accumulate as PENDING. When Order Service restarts, the worker resumes and publishes all pending events. This is acceptable because the outbox table is the source of truth.

## 4. Event Status Transitions

```
                        ┌─────────────────────────────┐
                        │                             │
                        v                             │
  ┌─────────┐    ┌────────────┐    ┌───────────┐     │
  │ PENDING │───>│ PROCESSING │───>│ PUBLISHED │     │
  └─────────┘    └────────────┘    └───────────┘     │
       ^               │                              │
       │               │ (publish failed,              │
       │               │  retries remain)              │
       └───────────────┘                              │
                        │                              │
                        │ (max attempts exceeded)      │
                        v                              │
                   ┌────────┐                         │
                   │ FAILED │                         │
                   └────────┘                         │
                        │                              │
                        │ (manual replay)              │
                        └─────────────────────────────┘

  DLQ status is set manually when an event is identified
  as problematic (e.g., consumer repeatedly fails on it)
```

| Status | Meaning |
|--------|---------|
| `PENDING` | Waiting to be picked up by the outbox worker |
| `PROCESSING` | Currently being published (locked by worker) |
| `PUBLISHED` | Successfully confirmed by RabbitMQ |
| `FAILED` | Max publish attempts exceeded |
| `DLQ` | Moved to dead-letter queue (consumer-side or manual classification) |

## 5. What Happens When RabbitMQ Is Unavailable

```
1. Order creation succeeds (DB transaction commits)
2. Outbox event created with status = PENDING
3. Outbox worker attempts to publish
4. RabbitMQ connection fails
5. Event stays PENDING (or transitions PROCESSING → PENDING with incremented attempts)
6. Worker retries on next poll cycle
7. Events accumulate in outbox_events table
8. When RabbitMQ recovers:
   - Worker successfully publishes all pending events
   - Events transition to PUBLISHED
   - Consumer processes them (may be a batch)
```

**Key insight:** The outbox table acts as a durable buffer. No events are lost even during extended RabbitMQ outages.

## 6. Handling Duplicate Publishing

If the outbox worker publishes an event but crashes before marking it PUBLISHED, the event remains PENDING/PROCESSING. On the next poll cycle, it will be re-published.

**This is by design.** The outbox guarantees at-least-once publishing. Duplicate publishing is handled by:
1. Consumer-side idempotency (the `processed_events` table in User Service)
2. The `eventId` in the message, which the consumer checks before processing

## 7. What the Outbox Pattern Guarantees

✅ If an order is committed, its event will eventually be published (assuming RabbitMQ eventually recovers).
✅ No event will be published without the corresponding order existing.
✅ Events are published at least once.
✅ Events are published in approximate creation order (ordered by `created_at`).

## 8. What the Outbox Pattern Does NOT Guarantee

❌ **Exactly-once publishing:** The same event may be published more than once (see Section 6).
❌ **Real-time delivery:** There is a delay between order creation and event publication (poll interval).
❌ **Strict ordering:** Under retries, a later event may be published before an earlier failed event.
❌ **Consumer processing:** The outbox only guarantees publication to RabbitMQ, not that the consumer successfully processes the event.

## 9. Why Not Direct Publish?

An alternative is to publish directly to RabbitMQ after the DB commit:

```
BEGIN TRANSACTION
  INSERT order
COMMIT
publish to RabbitMQ  // ← outside transaction
```

**Problem:** If the publish fails (network error, RabbitMQ down), the order exists but the event is lost. We'd need our own retry mechanism — which is exactly what the outbox table provides, but ad-hoc and less reliable.

## 10. Why Not a Shared Transaction (2PC)?

Two-Phase Commit (2PC) between PostgreSQL and RabbitMQ would guarantee atomicity across both systems.

**Why we don't use it:**
- RabbitMQ does not support XA/2PC.
- 2PC is slow, complex, and brittle (coordinator becomes a single point of failure).
- The outbox pattern achieves the same practical result with simpler, more resilient infrastructure.
- For an assignment-scale system, 2PC is over-engineering.

## 11. Stale PROCESSING Events

If the worker crashes while events are in PROCESSING status, they will be "stuck." The worker should detect stale PROCESSING events on startup:

```sql
UPDATE outbox_events 
SET status = 'PENDING' 
WHERE status = 'PROCESSING' 
  AND updated_at < NOW() - INTERVAL '5 minutes'
```

This resets events that were locked but never completed.
