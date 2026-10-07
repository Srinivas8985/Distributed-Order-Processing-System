# Phase 0 — Architecture Design

## 1. High-Level Architecture

The system is divided into two conceptual planes:

### Business Plane
Handles real user and order operations. No administrative or diagnostic concerns leak into business logic.

### Control Plane
Handles operational concerns: observability, failure simulation, event recovery. Communicates with Business Plane services via admin APIs, never by directly accessing business databases.

## 2. Architecture Diagram (Textual)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BUSINESS PLANE                                │
│                                                                         │
│  ┌──────────┐     POST /orders     ┌──────────────┐                    │
│  │  Client   │ ──────────────────> │ Order Service │                    │
│  │ (Postman) │ <────────────────── │   :3001       │                    │
│  └──────────┘                      └──────┬───────┘                    │
│       │                                   │                             │
│       │  POST /users                      │ GET /internal/users/:id     │
│       │  GET /users/:id                   │ (service-to-service auth)   │
│       │                                   │ timeout + retry + CB        │
│       v                                   v                             │
│  ┌──────────────┐                  ┌──────────────┐                    │
│  │ User Service  │ <───────────── │ Order Service │                    │
│  │   :3000       │  HTTP/REST      │              │                    │
│  └──────┬───────┘                  └──────┬───────┘                    │
│         │                                 │                             │
│         v                                 v                             │
│  ┌──────────┐                      ┌──────────┐                        │
│  │ User DB   │                      │ Order DB  │                       │
│  │ PG :5432  │                      │ PG :5433  │                       │
│  └──────────┘                      └──────────┘                        │
│                                           │                             │
│                                    ┌──────┴───────┐                    │
│                                    │ Outbox Worker │                    │
│                                    │ (in-process)  │                    │
│                                    └──────┬───────┘                    │
│                                           │ publish                    │
│                                           v                             │
│                                    ┌──────────────┐                    │
│                                    │   RabbitMQ    │                    │
│                                    │   :5672       │                    │
│                                    │   mgmt :15672 │                    │
│                                    └──────┬───────┘                    │
│                                           │ consume                    │
│                                           v                             │
│                                    ┌──────────────┐                    │
│                                    │ User Service  │                    │
│                                    │ (consumer)    │                    │
│                                    └──────┬───────┘                    │
│                                           │                             │
│                                           v                             │
│                                    ┌──────────────┐                    │
│                                    │ User DB       │                    │
│                                    │ activity_     │                    │
│                                    │ history       │                    │
│                                    └──────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           CONTROL PLANE                                 │
│                                                                         │
│  ┌─────────────────────┐                                                │
│  │ Reliability Console  │                                               │
│  │ Next.js :3002        │                                               │
│  └──────────┬──────────┘                                                │
│             │                                                           │
│             ├──── GET /health, GET /ready ──────> Order Service          │
│             ├──── GET /health, GET /ready ──────> User Service           │
│             │                                                           │
│             ├──── GET /admin/events ────────────> Order Service          │
│             ├──── POST /admin/events/:id/replay > Order Service          │
│             │                                                           │
│             ├──── POST /admin/simulate/* ──────> User Service            │
│             ├──── POST /admin/simulate/* ──────> Order Service           │
│             │                                                           │
│             └──── GET /admin/metrics ──────────> Order Service           │
│                   GET /admin/metrics ──────────> User Service            │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Communication Paths

### 3.1 Synchronous (REST/HTTP)

| From | To | Path | Why Synchronous |
|------|----|------|-----------------|
| Client | User Service | `POST /users`, `GET /users/:id` | Client needs immediate response to create/read users |
| Client | Order Service | `POST /orders`, `GET /orders/:id` | Client needs immediate response with order confirmation or data |
| Order Service | User Service | `GET /internal/users/:id/verify` | Order creation **requires** user validation before proceeding — the order cannot be created without knowing the user exists |
| Console | Any Service | `/health`, `/ready`, `/admin/*` | Dashboard needs real-time status; request-response semantics are appropriate |

**Why REST for synchronous communication:**
- Request-response pattern maps naturally to "verify then proceed" semantics.
- HTTP is universally understood, easy to test with Postman, and easy to debug.
- gRPC would add protobuf compilation complexity without meaningful benefit at this scale.
- GraphQL is optimized for flexible client queries, not for service-to-service RPC.

### 3.2 Asynchronous (RabbitMQ)

| From | To | Event | Why Asynchronous |
|------|----|-------|-----------------|
| Order Service (Outbox Worker) | RabbitMQ | `ORDER_CREATED` | Recording user activity is a **side effect** that should not block or fail the order-creation response |
| RabbitMQ | User Service (Consumer) | `ORDER_CREATED` | User Service processes the event independently; if it's slow or down, orders are not affected |

**Why a message broker for asynchronous communication:**
- **Temporal decoupling:** Order Service doesn't wait for User Service to record activity.
- **Failure isolation:** If User Service is down, the event is buffered in RabbitMQ.
- **At-least-once delivery:** RabbitMQ with ACKs ensures events are not lost.
- **Retry/DLQ:** Built-in mechanisms for handling consumer failures.
- Webhook/HTTP callbacks would require Order Service to implement its own retry queue — rebuilding what RabbitMQ already provides.

## 4. Component Descriptions

### 4.1 User Service (Port 3000)

**Responsibilities:**
- User CRUD operations (create, read)
- Internal user-verification endpoint for Order Service
- RabbitMQ consumer for `ORDER_CREATED` events
- User activity/history management
- Health and readiness endpoints
- Failure simulation endpoints (accept simulated faults)

**Owns:** User DB (users, activity_history, processed_events tables)

### 4.2 Order Service (Port 3001)

**Responsibilities:**
- Order CRUD operations (create, read)
- Idempotency enforcement via `Idempotency-Key`
- User verification via HTTP call to User Service (with timeout, retry, circuit breaker)
- Outbox event creation (transactional with order)
- Outbox worker (polls and publishes to RabbitMQ)
- Event management admin APIs (list, detail, replay)
- Health and readiness endpoints
- Failure simulation endpoints (consumer pause, etc.)

**Owns:** Order DB (orders, order_items, idempotency_keys, outbox_events tables)

### 4.3 User DB (Port 5432)

PostgreSQL instance dedicated to User Service. No other service connects to it.

### 4.4 Order DB (Port 5433)

PostgreSQL instance dedicated to Order Service. No other service connects to it.

### 4.5 RabbitMQ (Port 5672, Management 15672)

Message broker for asynchronous event delivery.
- Hosts the `order.events` exchange
- Hosts the `user.activity.queue` and its dead-letter queue
- Management UI available for debugging (included because RabbitMQ's official Docker image includes it at negligible cost)

### 4.6 Reliability Console (Port 3002)

Next.js frontend that communicates **only** via HTTP with the service APIs. It has no direct database access.

**Responsibilities:**
- Display system health (aggregates `/health` from both services)
- Display outbox/event statistics
- Display circuit-breaker state and retry metrics
- Provide event management UI (list, inspect, replay)
- Provide failure simulation controls
- Visualize request/event lifecycles

## 5. Data Flow: Order Creation (Happy Path)

```
1. Client sends POST /orders with Idempotency-Key header
2. Order Service checks idempotency_keys table
   → No existing key: proceed
3. Order Service calls GET /internal/users/:userId/verify on User Service
   → User Service authenticates the request via shared secret
   → User Service returns user data
4. Order Service begins database transaction:
   a. INSERT into orders
   b. INSERT into order_items
   c. INSERT into outbox_events (ORDER_CREATED, status=PENDING)
   d. INSERT into idempotency_keys (key, request_hash, response)
5. COMMIT transaction
6. Return 201 Created to client
7. Outbox Worker (polling every 5s):
   a. SELECT outbox_events WHERE status=PENDING
   b. Publish to RabbitMQ exchange
   c. UPDATE outbox_events SET status=PUBLISHED
8. RabbitMQ delivers message to user.activity.queue
9. User Service consumer:
   a. Check processed_events for duplicate eventId
   b. If not duplicate: INSERT into activity_history
   c. INSERT into processed_events
   d. ACK the message
```

## 6. Data Flow: Order Creation (User Service Unavailable)

```
1. Client sends POST /orders
2. Order Service checks idempotency
3. Order Service calls User Service
   → Timeout after 3000ms
   → Retry #1 (after 1000ms backoff)
   → Timeout again
   → Retry #2 (after 2000ms backoff)
   → Timeout again
   → Circuit breaker may open if threshold reached
4. Order Service returns 503 Service Unavailable
   {
     "error": "USER_SERVICE_UNAVAILABLE",
     "message": "Unable to verify user. Please retry later.",
     "retryable": true
   }
5. No order created, no outbox event, no idempotency key consumed
6. Client can retry with same Idempotency-Key
```
