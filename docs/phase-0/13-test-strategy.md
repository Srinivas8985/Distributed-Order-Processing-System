# Phase 0 — Test Strategy & Requirements Traceability

## 1. Test Layers

### 1.1 Unit Tests (Vitest)

Test individual functions/modules in isolation. No database, no HTTP, no RabbitMQ.

| Component | Tests |
|-----------|-------|
| Idempotency hash function | Canonical body serialization, SHA-256 consistency |
| Validation schemas (Zod) | Valid inputs pass, invalid inputs fail with correct messages |
| Circuit breaker state machine | State transitions: CLOSED→OPEN→HALF-OPEN→CLOSED, failure counting, reset |
| Retry logic | Correct backoff calculation, jitter bounds, max attempts |
| Event contract builder | Correct event shape, required fields present |
| Error classification | 404 non-retryable, 503 retryable, timeout retryable |
| Total amount calculation | Items × price rounding, edge cases |

### 1.2 Integration Tests (Vitest + Supertest)

Test a single service with its database. No external services.

| Component | Tests |
|-----------|-------|
| User CRUD | Create user → read user, duplicate email → 409, validation → 400 |
| Order CRUD | Create order (with mocked user verification) → read order |
| Idempotency | First request → 201, duplicate → 200, conflict → 409 |
| Outbox event creation | Order creation produces outbox event atomically |
| Health/readiness | `/health` returns 200, `/ready` checks database |
| Auth middleware | Valid token → pass, invalid → 401, missing → 401 |
| Admin auth middleware | Valid key → pass, invalid → 401 |
| Rate limiter | Under limit → pass, over limit → 429 |
| Validation middleware | Invalid UUID → 400, invalid body → 400 |

### 1.3 API Tests (Vitest + Supertest)

Test the HTTP interface of each service, including error responses and edge cases.

| Test | Endpoint | Scenario |
|------|----------|----------|
| Create user with valid data | POST /users | Happy path |
| Create user with invalid email | POST /users | Validation error |
| Get non-existent user | GET /users/:id | 404 |
| Create order without Idempotency-Key | POST /orders | 400 |
| Get order with invalid UUID | GET /orders/:id | 400 |

### 1.4 Messaging Tests (Vitest)

Test RabbitMQ integration.

| Test | Component | Scenario |
|------|-----------|----------|
| Outbox worker publishes event | Outbox Worker | PENDING → PUBLISHED with real RabbitMQ |
| Consumer processes event | Consumer | Message → activity_history record |
| Consumer handles duplicate | Consumer | Same eventId → skip, ACK |
| Consumer handles poison message | Consumer | Invalid schema → DLQ |
| Publisher confirm | Producer | Message acknowledged by broker |

### 1.5 Database Tests (Vitest + Prisma)

Test database constraints and behaviors.

| Test | Table | Scenario |
|------|-------|----------|
| Unique email constraint | users | Duplicate email → unique violation |
| Unique idempotency key | idempotency_keys | Duplicate key → unique violation |
| Cascade delete | order_items | Delete order → items deleted |
| Transaction atomicity | orders + outbox_events | Both created or neither |
| Check constraint | order_items | quantity <= 0 → check violation |

### 1.6 Resilience Tests (Vitest + Nock/MSW)

Test resilience patterns with mocked external services.

| Test | Component | Scenario |
|------|-----------|----------|
| Timeout triggers retry | HTTP Client | Mock User Service to delay > timeout → verify retry |
| Max retries exhausted | HTTP Client | Mock User Service to always fail → verify 503 returned |
| Circuit breaker opens | Circuit Breaker | 5 failures → verify state=OPEN |
| Circuit breaker half-open | Circuit Breaker | Wait resetTimeout → verify state=HALF-OPEN |
| Circuit breaker closes | Circuit Breaker | Successful probe → verify state=CLOSED |
| Non-retryable error skips retry | HTTP Client | Mock 404 → verify no retries |
| Exponential backoff timing | Retry Logic | Verify delays increase correctly |

### 1.7 Failure/Chaos Tests (Vitest + Docker)

End-to-end tests that simulate real failures. These may require a running Docker Compose environment.

| Test | Scenario | Verification |
|------|----------|-------------|
| RabbitMQ down during order creation | Stop RabbitMQ container | Order created, event PENDING, no data loss |
| RabbitMQ recovery | Restart RabbitMQ | Pending events published, activity created |
| User Service restart during order creation | Stop User Service | 503 returned, retry on restart → 201 |
| Consumer restart | Restart User Service consumer | Messages redelivered, idempotency prevents duplicates |

---

## 2. Test File Organization

```
services/user-service/
  src/
    __tests__/
      unit/
        validation.test.ts
      integration/
        user.routes.test.ts
        auth.middleware.test.ts
        consumer.test.ts
      setup.ts

services/order-service/
  src/
    __tests__/
      unit/
        idempotency.test.ts
        circuit-breaker.test.ts
        retry.test.ts
        order-total.test.ts
      integration/
        order.routes.test.ts
        idempotency.routes.test.ts
        outbox.test.ts
        resilience.test.ts
      setup.ts
```

---

## 3. Requirements Traceability Matrix

| ID | Requirement | Implementation | Test | Evidence |
|----|------------|----------------|------|----------|
| FR-01 | POST /users | User Service: user.routes.ts | Integration: user.routes.test.ts, Postman: 01-Create User | 201 response |
| FR-02 | GET /users/:id | User Service: user.routes.ts | Integration: user.routes.test.ts, Postman: 01-Get User | 200 response |
| FR-03 | User DB ownership | Docker Compose: separate PG instance | Verify no Order Service connection to User DB | Architecture diagram |
| FR-04 | POST /orders | Order Service: order.routes.ts | Integration: order.routes.test.ts, Postman: 02-Create Order | 201 response |
| FR-05 | GET /orders/:id | Order Service: order.routes.ts | Integration: order.routes.test.ts, Postman: 02-Get Order | 200 response |
| FR-06 | Order DB ownership | Docker Compose: separate PG instance | Verify no User Service connection to Order DB | Architecture diagram |
| FR-07 | User verification via HTTP | Order Service: user-verification.client.ts | Resilience: resilience.test.ts, Postman: 02-Create Order | Logs showing HTTP call |
| FR-08 | Service-to-service auth | X-Service-Auth middleware | Integration: auth.middleware.test.ts, Postman: 03-Auth | 401 for invalid, 200 for valid |
| FR-09 | Timeout handling | HTTP client config: 3000ms | Resilience: resilience.test.ts, Postman: 05-Timeout | 503 with timing > 3s |
| FR-10 | Limited retries | Retry wrapper: max 3 | Resilience: resilience.test.ts, Postman: 05-Resilience | Logs showing retry count |
| FR-11 | Graceful failure | Error handler returns 503 | Resilience: resilience.test.ts, Postman: 05-Resilience | 503 with retryable=true |
| FR-12 | Idempotency-Key | Idempotency middleware | Integration: idempotency.routes.test.ts, Postman: 04-Idempotency | 201→200→409 |
| FR-13 | ORDER_CREATED event | Outbox + RabbitMQ producer | Messaging: outbox.test.ts, Postman: 06-Events | Event in PUBLISHED status |
| FR-14 | RabbitMQ | amqplib connection | Messaging: consumer.test.ts | Consumer processes message |
| FR-15 | User activity/history | Consumer + activity_history table | Messaging: consumer.test.ts, Postman: 06-Activity | Activity record exists |
| FR-16 | No cross-DB access | Separate DB URLs in config | Architecture review | Architecture diagram |
| FR-17 | Outbox Pattern | Transaction: order + outbox event | Database: outbox.test.ts, Postman: 07-Outbox | Atomic creation verified |
| FR-18 | Docker Compose | docker-compose.yml | `docker compose up` runs all services | Screenshot |
| FR-19 | .env.example | .env.example file | File exists with all variables | File listing |
| FR-20 | Postman collection | postman/ directory | Collection runs end-to-end | Test run results |
| FR-21 | README | README.md | Content review | README file |
| FR-22 | Architecture diagram | docs/architecture-diagram.* | Visual review | Diagram image |
| FR-23 | Basic tests | test suites | `npm test` passes | Test results |
| FR-E01 | Failure Simulation | Simulation middleware + admin APIs | Postman: 05-Resilience, 10-Failure | 503 during simulation |
| FR-E02 | Event Replay | POST /admin/events/:id/replay | Postman: 08-Replay | FAILED→PENDING→PUBLISHED |
| FR-E03 | Reliability Console | Next.js dashboard | Manual demo | Screenshot |
| FR-E04 | Circuit breaker | Circuit breaker state machine | Unit: circuit-breaker.test.ts | State transitions verified |
| FR-E05 | Dead-letter queue | RabbitMQ DLQ configuration | Messaging: consumer.test.ts | Message in DLQ |
| FR-E06 | Health/readiness | /health and /ready endpoints | Postman: 09-Health | 200 responses |
| FR-E07 | Correlation IDs | Middleware propagation | Integration: all route tests | Headers present |
| FR-E08 | Consumer idempotency | processed_events table | Messaging: consumer.test.ts | Duplicate skipped |
| FR-E09 | Admin auth | X-Admin-Key middleware | Integration: auth.middleware.test.ts | 401 for invalid |

---

## 4. Test Coverage Goals

| Layer | Target | Rationale |
|-------|--------|-----------|
| Unit tests | All pure functions | Fast, reliable baseline |
| Integration tests | All HTTP endpoints | Verify API contracts |
| Messaging tests | Producer and consumer | Verify async flow |
| Resilience tests | Timeout, retry, circuit breaker | Core distributed-systems concerns |
| Postman tests | End-to-end scenarios | Evidence for assignment submission |

**Not targeting:**
- 100% line coverage (diminishing returns)
- Performance/load tests (out of scope)
- Browser/UI tests for Reliability Console (manual demo instead)
