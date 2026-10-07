# Phase 0 — RabbitMQ & Messaging Design

## 1. Topology

### Exchange

| Property | Value | Rationale |
|----------|-------|-----------|
| Name | `order.events` | Namespaced by domain (order) |
| Type | `topic` | Allows flexible routing via routing keys; future event types can be added without exchange changes |
| Durable | `true` | Survives broker restarts |
| Auto-delete | `false` | Persists even when no queues are bound |

### Queue: Activity Processing

| Property | Value | Rationale |
|----------|-------|-----------|
| Name | `user.activity.queue` | Namespaced by consumer domain (user) and purpose (activity) |
| Durable | `true` | Survives broker restarts; messages are not lost |
| Exclusive | `false` | Can be consumed by multiple instances |
| Auto-delete | `false` | |
| Binding exchange | `order.events` | |
| Routing key | `order.created` | Specific to ORDER_CREATED events |

### Dead-Letter Queue

| Property | Value | Rationale |
|----------|-------|-----------|
| Name | `user.activity.dlq` | Convention: same name with `.dlq` suffix |
| Durable | `true` | |
| Bound to | `order.events.dlq` (dead-letter exchange) | Separate DLX for dead-letter routing |

### Dead-Letter Exchange

| Property | Value |
|----------|-------|
| Name | `order.events.dlq` |
| Type | `fanout` |
| Durable | `true` |

### Queue Arguments for `user.activity.queue`

| Argument | Value |
|----------|-------|
| `x-dead-letter-exchange` | `order.events.dlq` |
| `x-dead-letter-routing-key` | (empty — fanout) |
| `x-message-ttl` | Not set (messages don't expire in main queue) |

---

## 2. Event Contract

### ORDER_CREATED Event

```json
{
  "eventId": "880e8400-e29b-41d4-a716-446655440000",
  "eventType": "ORDER_CREATED",
  "version": 1,
  "occurredAt": "2024-01-15T10:30:00.000Z",
  "producer": "order-service",
  "correlationId": "990e8400-e29b-41d4-a716-446655440000",
  "data": {
    "orderId": "660e8400-e29b-41d4-a716-446655440000",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "totalAmount": 72.48,
    "itemCount": 2,
    "status": "CONFIRMED",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Field Descriptions

| Field | Type | Purpose |
|-------|------|---------|
| `eventId` | UUID | Globally unique identifier for this event instance. Used for consumer-side deduplication. Matches `outbox_events.id`. |
| `eventType` | string | Discriminator for consumers to route to the correct handler. |
| `version` | integer | Schema version. Enables backward-compatible evolution. Consumers can handle multiple versions. |
| `occurredAt` | ISO-8601 | When the business event occurred (order creation time), not when the message was published. Distinguishes business time from infrastructure time. |
| `producer` | string | Identifies the producing service. Useful in multi-service topologies for debugging and filtering. |
| `correlationId` | UUID | Links this event to the original HTTP request. Enables end-to-end distributed tracing across sync and async boundaries. |
| `data` | object | The business payload. Contains only the data the consumer needs, not the entire order aggregate. |

---

## 3. Message Properties

| Property | Value | Rationale |
|----------|-------|-----------|
| `persistent` | `true` (deliveryMode=2) | Message survives broker restart; written to disk |
| `contentType` | `application/json` | |
| `messageId` | Same as `eventId` | RabbitMQ-level deduplication hint |
| `correlationId` | Same as event `correlationId` | Visible in RabbitMQ management UI |
| `timestamp` | Unix timestamp of publish | |
| `headers.x-retry-count` | integer | Tracks redelivery count at RabbitMQ level |

---

## 4. Producer (Order Service — Outbox Worker)

The producer is the Outbox Worker, NOT the order-creation handler directly. See Outbox Design (Section 11) for why.

### Publishing Flow

```
1. SELECT * FROM outbox_events WHERE status = 'PENDING' AND next_retry_at <= NOW() LIMIT 10
2. For each event:
   a. UPDATE status = 'PROCESSING'
   b. Publish to exchange 'order.events' with routing key 'order.created'
   c. Wait for publisher confirm
   d. If confirmed: UPDATE status = 'PUBLISHED', published_at = NOW()
   e. If failed: 
      - Increment attempts
      - If attempts < max_attempts: UPDATE status = 'PENDING', next_retry_at = NOW() + backoff
      - If attempts >= max_attempts: UPDATE status = 'FAILED'
```

### Publisher Confirms
RabbitMQ publisher confirms are enabled. The producer waits for the broker to acknowledge receipt before marking the event as PUBLISHED. Without confirms, a network failure between publish and PUBLISHED update could cause the event to be published but remain PENDING, leading to duplicate publishing.

**Trade-off:** Publisher confirms add latency (~1-5ms per message) but are essential for reliability. This is acceptable for our throughput requirements.

---

## 5. Consumer (User Service)

### Consumption Flow

```
1. Receive message from user.activity.queue
2. Parse and validate message schema
3. Extract eventId
4. BEGIN TRANSACTION
   a. Check processed_events for eventId
      → If exists: skip (duplicate), ACK the message
   b. INSERT INTO activity_history (user_id, activity_type, ...)
   c. INSERT INTO processed_events (event_id, event_type, processed_at)
5. COMMIT
6. ACK the message
```

### ACK Behavior

| Scenario | Action | Rationale |
|----------|--------|-----------|
| Processing succeeds | `channel.ack(msg)` | Message processed, remove from queue |
| Duplicate event | `channel.ack(msg)` | Already processed, safe to discard |
| Processing fails (transient) | `channel.nack(msg, false, true)` | Requeue for retry |
| Processing fails (3rd time) | `channel.nack(msg, false, false)` | Send to DLQ via dead-letter exchange |
| Invalid message (unparseable) | `channel.nack(msg, false, false)` | Poison message → DLQ. Retrying won't help. |
| Consumer crash (no ACK sent) | RabbitMQ redelivers | At-least-once guarantee |

### Prefetch

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `prefetchCount` | `10` | Process up to 10 messages concurrently per consumer. Balances throughput and memory. |

---

## 6. Delivery Guarantees

### At-Least-Once Delivery

RabbitMQ provides **at-least-once** delivery when:
1. Messages are **persistent** (deliveryMode=2)
2. Queues are **durable**
3. Consumer uses **manual ACK** (not auto-ack)
4. Publisher uses **confirms**

**What "at-least-once" means:**
- Every published message will be delivered to a consumer at least once.
- In failure scenarios (consumer crash, network partition), the same message may be delivered MORE than once.
- The consumer must handle duplicates.

### Why NOT Exactly-Once

RabbitMQ does not guarantee exactly-once delivery. Achieving exactly-once at the message-broker level requires distributed transactions between the broker and the consumer's database, which is complex and slow. Instead, we achieve **effective exactly-once processing** via consumer-side idempotency (the `processed_events` table).

### Duplicate Delivery Scenarios

| Scenario | What Happens |
|----------|-------------|
| Consumer processes message, crashes before ACK | RabbitMQ redelivers → consumer checks `processed_events` → duplicate detected → ACK without re-processing |
| Network partition during ACK | RabbitMQ redelivers → same as above |
| Outbox worker publishes, crashes before marking PUBLISHED | Worker re-publishes → RabbitMQ delivers duplicate → consumer handles via `processed_events` |

---

## 7. Consumer Crash Recovery

```
1. Consumer C1 receives message M1
2. C1 begins processing M1
3. C1 crashes (process killed)
4. RabbitMQ detects connection loss (heartbeat timeout, ~60s)
5. RabbitMQ redelivers M1 to another consumer (or same consumer after restart)
6. Message M1 has redelivered=true flag set by RabbitMQ
7. Consumer processes M1:
   - If C1 had committed the transaction: processed_events has eventId → skip, ACK
   - If C1 had NOT committed: processed_events does not have eventId → process normally
```

---

## 8. Consumer Retry Strategy

The consumer tracks retry count via the `x-retry-count` header:

| Attempt | Action |
|---------|--------|
| 1st delivery | Process normally |
| 2nd delivery (requeue) | Process normally, increment x-retry-count |
| 3rd delivery (requeue) | Process normally, increment x-retry-count |
| 4th delivery | `nack(false, false)` → DLQ |

**Design choice:** 3 retries before DLQ. This is sufficient for transient errors (database blip) while preventing infinite retry loops for genuine failures (schema mismatch, corrupted data).

---

## 9. RabbitMQ Connection Management

| Parameter | Value |
|-----------|-------|
| Heartbeat interval | `60` seconds |
| Connection timeout | `10000` ms |
| Reconnect attempts | `unlimited` (with backoff) |
| Reconnect backoff | 1s → 2s → 4s → 8s → 16s → 30s (capped) |

The service should gracefully reconnect to RabbitMQ after a broker restart or network interruption. During reconnection:
- **Producer (Outbox Worker):** Events accumulate in the outbox table with PENDING status. No data loss.
- **Consumer:** Messages accumulate in the queue. RabbitMQ persists them (durable + persistent). No data loss.
