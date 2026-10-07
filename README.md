# Distributed Order Processing & Reliability Platform

This project implements a robust, distributed microservices architecture consisting of a **User Service** and an **Order Service**, demonstrating enterprise-grade reliability patterns.

## Implementation Status
- [x] **Phase 0:** Architecture & Design
- [x] **Phase 1:** Docker Foundation & Scaffolding
- [x] **Phase 2:** Database Setup & Prisma
- [x] **Phase 3:** Core Service Implementation
- [x] **Phase 4:** Synchronous Communication & Auth
- [x] **Phase 5:** Resilience (Retries, Circuit Breaker, Timeouts)
- [x] **Phase 6:** Idempotency & Concurrency Management
- [x] **Phase 7:** Asynchronous Events (RabbitMQ)
- [x] **Phase 8:** Outbox Pattern & Event Reliability
- [ ] **Phase 9:** Reliability Console & DLQ

---

## Phase 6: Idempotency & Concurrency

### Why Idempotency is Needed
In a distributed system, network failures often cause clients to retry requests that may have already reached the server. Without idempotency, a retried `POST /orders` request would create duplicate orders and charge the user multiple times. By requiring an `Idempotency-Key` header, the system guarantees that no matter how many times a request is retried, the order is created **exactly once**.

### How Duplicate Requests are Handled
When a request arrives with an existing `Idempotency-Key`:
1. The server computes a **Request Fingerprint** (a SHA-256 hash of the canonicalized request body).
2. It checks the database. If the hash matches the originally stored hash, it returns the originally cached response (whether it was a `201 Created` or a `503 Service Unavailable`).
3. If the hash differs (Same Key, Different Payload), the request is strictly rejected with a `409 IDEMPOTENCY_CONFLICT` to prevent dangerous misuse of keys.

### Handling Concurrent Requests (Race Conditions)
A naive "check-then-insert" approach is vulnerable to race conditions if two identical requests arrive at the exact same millisecond. 
To solve this, we rely on a **Database-Level Unique Constraint**:
1. The system attempts to safely insert the key into PostgreSQL.
2. If another request is currently processing the same key, the database blocks or throws a Unique Constraint Violation (`P2002`).
3. The secondary request waits briefly and then fetches the cached result of the winner, ensuring absolutely zero duplicate orders.

### Transaction Boundaries & Failure Behavior
The Idempotency Key record is created and locked **before** calling the external User Service. 
- If the User Service fails (e.g. `503 Timeout`), that failure is explicitly saved to the Idempotency Key. Retrying clients will deterministically get the same `503` rather than a surprisingly different result, until they generate a new key.
- If user verification fails (`404 Not Found`), no order is created, fulfilling the invariant that an order cannot exist without a valid user.

### System Flow
```
Client
  |
  | POST /orders
  | Idempotency-Key: abc-123
  v
Order Service
  |
  | Compute Request Fingerprint
  | Attempt to lock/insert idempotency record safely
  |
  v
PostgreSQL
  |
  +--> Existing Key -> Check Hash -> Return cached order/error
  |
  +--> New Key -> Call User Service -> Create Order in Transaction -> Cache Result
```

---

## Phase 7: RabbitMQ & Event Architecture

### Synchronous vs Asynchronous Communication
While order validation strictly requires synchronous communication with the User Service (an order cannot be placed if the user doesn't exist), secondary side-effects like recording activity history do not need to block the client's HTTP response.

Phase 7 introduces an event-driven architecture using RabbitMQ for **Asynchronous Communication**. Once the order is created, the Order Service publishes an `ORDER_CREATED` event, which the User Service consumes in the background to update the user's `activity_history`.

### The ORDER_CREATED Event Flow
```text
                    ┌─────────────────┐
                    │   Order Client  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Order Service  │
                    └───────┬─────────┘
                            │
                REST        │
                            ▼
                    ┌─────────────────┐
                    │  User Service  │
                    └─────────────────┘

Order Service
      │
      │ ORDER_CREATED
      ▼
┌─────────────────┐
│    RabbitMQ     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Consumer  │
└────────┬────────┘
         │
         ▼
   User DB
   ├── activity_history
   └── processed_events
```

### RabbitMQ Topology
- **Exchange**: `order.events` (Topic, Durable)
- **Queue**: `user.activity.queue` (Durable)
- **Routing Key**: `order.created`
- **Messages**: Persistent (`deliveryMode=2`), JSON payload

### Consumer Idempotency & Data Ownership
Because RabbitMQ guarantees *at-least-once* delivery, a network partition could cause an event to be redelivered. To prevent duplicate history entries, the User Service implements **Consumer Idempotency**. 
It atomically processes the event and writes the `eventId` to a `processed_events` table in a single database transaction. If the same event arrives again, the unique `eventId` is detected and safely ignored.
Furthermore, strict **Data Ownership** is maintained: the Order Service never touches the User DB, and the User Service never queries the Order DB. All necessary context is carried via the event envelope.

---

## Phase 8: Transactional Outbox Pattern

### Eliminating the Event Loss Window
In Phase 7, the Order Service published the event to RabbitMQ *after* the database transaction committed. If the server crashed in the exact millisecond between the DB commit and the RabbitMQ publish, the event was permanently lost.

Phase 8 eliminates this using the **Transactional Outbox Pattern**:
1. An **Atomic DB Transaction** creates the `orders`, `order_items`, and `outbox_events` records simultaneously. If the database crashes, everything rolls back. There are no orphan orders.
2. A **Background Outbox Publisher** asynchronously reads `PENDING` outbox events and publishes them to RabbitMQ.
3. Upon successful publication, the publisher marks the outbox event as `PUBLISHED`.

### Eventual Consistency & Retry Behavior
If RabbitMQ is temporarily unavailable, the order is still successfully placed! The HTTP client gets a fast `201 Created` because the outbox event is safely persisted. The publisher will automatically retry sending the event once RabbitMQ comes back online (At-Least-Once Delivery). 

If the publisher crashes *after* publishing but *before* marking it `PUBLISHED` in the database, the event will be duplicated. The User Service gracefully handles this duplication via its Phase 7 **Consumer Idempotency** (`processed_events`).

### Complete Architecture Flow

```text
Client
   |
   v
Order Service
   |
   +------------------> User Service
   |                     |
   |                     v
   |                   User DB
   |
   v
Order DB
   |
   +--> orders
   +--> order_items
   +--> idempotency_keys
   +--> outbox_events
             |
             v
      Outbox Publisher (Background Worker)
             |
             v
          RabbitMQ
             |
             v
      User Service Consumer
             |
             v
          User DB
             |
             +--> activity_history
             +--> processed_events
```
