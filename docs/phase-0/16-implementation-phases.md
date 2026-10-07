# Phase 0 — Implementation Phases & Consistency Review

## Part A: Implementation Phase Breakdown

### Phase 1: Foundation (Scaffold, Docker, DB, Health)

**Goal:** All containers start, databases are provisioned, health endpoints respond.

| Task | Deliverable |
|------|-------------|
| Initialize monorepo | Root `package.json`, `.gitignore` |
| Scaffold User Service | Express app, Pino logger, tsconfig, Dockerfile |
| Scaffold Order Service | Express app, Pino logger, tsconfig, Dockerfile |
| Define Prisma schemas | `schema.prisma` for both services |
| Create Docker Compose | `docker-compose.yml` with all 6 containers |
| Create `.env.example` | All environment variables with placeholder values |
| Implement `/health` and `/ready` | Both services |
| RabbitMQ pre-configuration | Exchange, queue, DLQ definitions |
| Run Prisma migrations | Tables created in both databases |

**Verification:** `docker compose up` → all containers healthy → `/health` returns 200 on both services.

---

### Phase 2: User Service

**Goal:** User CRUD works. Internal verification endpoint works with service-to-service auth.

| Task | Deliverable |
|------|-------------|
| Request ID / Correlation ID middleware | Generates and propagates IDs |
| Error handling middleware | Consistent error response format |
| Zod validation schemas | User creation validation |
| `POST /users` | Create user endpoint |
| `GET /users/:id` | Get user endpoint |
| Service auth middleware | `X-Service-Auth` validation |
| `GET /internal/users/:id/verify` | Internal verification endpoint |
| Rate limiter | express-rate-limit on public endpoints |
| Helmet (secure headers) | Security headers middleware |
| Unit tests | Validation schemas |
| Integration tests | User routes, auth middleware |

**Verification:** Postman: Create user → Get user → Verify user (with auth) → 401 without auth.

---

### Phase 3: Order Service (Core)

**Goal:** Orders can be created with idempotency and resilient user verification. No events yet.

| Task | Deliverable |
|------|-------------|
| Zod validation schemas | Order creation validation |
| Resilient HTTP client | Timeout + retry + exponential backoff |
| Circuit breaker | State machine implementation |
| User verification service | HTTP client to User Service |
| Idempotency middleware | Key extraction, hash, dedup |
| `POST /orders` | Create order endpoint (without outbox for now) |
| `GET /orders/:id` | Get order endpoint |
| Admin auth middleware | `X-Admin-Key` validation |
| Unit tests | Circuit breaker, retry logic, idempotency hash |
| Integration tests | Order routes, idempotency, resilience |

**Verification:** Postman: Create order → Get order → Duplicate key returns 200 → Different body returns 409 → Simulate User Service down → 503 with retries logged.

---

### Phase 4: Outbox Pattern & RabbitMQ Producer

**Goal:** Order creation atomically creates outbox events. Worker publishes to RabbitMQ.

| Task | Deliverable |
|------|-------------|
| Add outbox event creation to order transaction | Atomic order + outbox insert |
| Outbox worker | Polling, publishing, status transitions |
| RabbitMQ connection manager | Connection, channel, publisher confirms |
| Publisher implementation | Build message, publish to exchange |
| Admin: `GET /admin/events` | List outbox events |
| Admin: `GET /admin/events/:id` | Event detail |
| Integration tests | Outbox creation, worker publishing |

**Verification:** Create order → outbox event in PENDING → worker publishes → event in PUBLISHED. RabbitMQ Management UI shows message in queue.

---

### Phase 5: RabbitMQ Consumer & User Activity

**Goal:** User Service consumes ORDER_CREATED events and creates activity records.

| Task | Deliverable |
|------|-------------|
| RabbitMQ consumer | Connection, channel, message handler |
| Event validation | Validate message schema |
| Consumer idempotency | processed_events check/insert |
| Activity recording | activity_history insert |
| ACK/NACK logic | Success → ACK, failure → NACK, poison → DLQ |
| Consumer retry tracking | x-retry-count header |
| Integration tests | Consumer processing, duplicate detection, DLQ |

**Verification:** Create order → wait → activity_history record exists. Same event redelivered → duplicate skipped. Invalid message → DLQ.

---

### Phase 6: Event Replay & Failure Simulation

**Goal:** Admin can replay events and inject failures.

| Task | Deliverable |
|------|-------------|
| `POST /admin/events/:id/replay` | Event replay endpoint |
| Simulation state management | In-memory fault flags |
| Simulation middleware | Timeout, delay, 503 injection |
| Consumer simulation | Pause, resume, fail_next |
| `POST /admin/simulate/*` endpoints | All simulation APIs |
| `POST /admin/simulate/reset` | Clear all simulations |
| `GET /admin/metrics` | Metrics endpoint |
| Environment guard | 403 in production |
| Integration tests | Replay, simulation activation/reset |

**Verification:** Simulate timeout → order creation fails with retries. Reset → works again. Fail consumer → DLQ → replay → activity created.

---

### Phase 7: Reliability Console

**Goal:** Visual dashboard for system observability and control.

| Task | Deliverable |
|------|-------------|
| Scaffold Next.js app | App router, Tailwind, Dockerfile |
| Dashboard page | Health cards, metric cards, circuit breaker widget |
| Events page | Event table, detail modal, replay button |
| Simulation page | Simulation cards, reset button |
| Lifecycle page | Order lookup, timeline visualization |
| API client | HTTP client for service APIs |
| Polling hooks | useHealth, useMetrics, useEvents |

**Verification:** Dashboard shows all services healthy. Events page lists events. Simulation page activates/deactivates faults. Lifecycle page shows order journey.

---

### Phase 8: Polish, Postman, Tests, Documentation

**Goal:** Complete evidence package for submission.

| Task | Deliverable |
|------|-------------|
| Postman collection | All tests from test plan |
| Postman environment | Variables configured |
| Architecture diagram | Visual diagram (draw.io or similar) |
| README.md | Complete with all required explanations |
| Run all tests | Ensure passing |
| Code review | Consistency, error handling, edge cases |
| Evidence collection | Screenshots, test results |

**Verification:** Complete Postman collection runs end-to-end. README explains all required topics. All tests pass.

---

## Part B: Internal Consistency Review

### Check 1: API Contracts Match Database Ownership ✅

| API | Database | Correct? |
|-----|----------|----------|
| POST /users → users table | User DB | ✅ |
| GET /users/:id → users table | User DB | ✅ |
| POST /orders → orders, order_items, outbox_events, idempotency_keys | Order DB | ✅ |
| GET /orders/:id → orders, order_items | Order DB | ✅ |
| Consumer → activity_history, processed_events | User DB | ✅ |
| Admin events → outbox_events | Order DB | ✅ |

No API reads from or writes to a database it doesn't own. ✅

### Check 2: Events Match Outbox Design ✅

- ORDER_CREATED event is defined with `eventId`, `eventType`, `version`, `occurredAt`, `producer`, `correlationId`, `data`.
- `outbox_events` table has `id` (becomes `eventId`), `event_type`, `payload` (contains full event), `status`, `attempts`.
- Outbox worker builds the event message from the outbox record.
- Event contract matches what the consumer expects.

### Check 3: Retries Don't Conflict with Idempotency ✅

- **Order Service retries to User Service:** These are internal HTTP retries. They don't involve the `Idempotency-Key` (which is on the client→Order Service boundary).
- **Client retries to Order Service:** The `Idempotency-Key` ensures duplicate client requests return the cached response.
- **Outbox worker retries:** May publish the same event twice. Consumer-side idempotency (`processed_events`) handles this.

No conflict between retry and idempotency mechanisms. ✅

### Check 4: DLQ/Replay Doesn't Create Duplicate Activity ✅

- Replay resets outbox event to PENDING → worker re-publishes → consumer receives.
- Consumer checks `processed_events` for `eventId` before inserting `activity_history`.
- If already processed: skip, ACK. No duplicate.
- If not processed: process normally.

Replay is safe due to consumer-side idempotency. ✅

### Check 5: Failure Simulation Cannot Bypass Security ✅

- Simulation endpoints require `X-Admin-Key` header.
- Simulation endpoints are disabled in production (`NODE_ENV` check).
- Simulations only set in-memory flags — no database modification, no file system access, no code execution.
- Simulations only affect specific application behaviors (verification endpoint, consumer), not authentication or authorization.

Simulation cannot be used to bypass security. ✅

### Check 6: Postman Tests Cover All Requirements ✅

| Requirement | Postman Folder | Covered? |
|------------|----------------|----------|
| User CRUD | 01 | ✅ |
| Order CRUD | 02 | ✅ |
| Service-to-service auth | 03 | ✅ |
| Idempotency | 04 | ✅ |
| Timeout handling | 05 | ✅ |
| Retries | 05 | ✅ |
| Graceful failure | 05 | ✅ |
| Async event | 06 | ✅ |
| User activity | 06 | ✅ |
| Outbox | 07 | ✅ |
| Event replay | 08 | ✅ |
| Health checks | 09 | ✅ |
| End-to-end scenarios | 10 | ✅ |

All assignment requirements have corresponding Postman tests. ✅

### Check 7: Every Requirement Has Implementation + Test ✅

The Requirements Traceability Matrix (Section 13) maps every FR to an implementation file, test file, and evidence type. All rows are complete.

---

## Part C: Open Design Questions

The following questions are identified as ambiguities. They are resolved with reasonable defaults but should be revisited during implementation if requirements become clearer.

| # | Question | Default Resolution |
|---|----------|-------------------|
| 1 | Should order status change after activity is recorded? | No — order status is managed by Order Service only. Activity recording is a separate concern. |
| 2 | Should users be able to list their activity? | Not in assignment scope. We create activity records but don't expose a public API for listing them. The admin API can show events. If needed, a `GET /users/:id/activity` endpoint can be added trivially. |
| 3 | What happens to orders if a user is deleted? | User deletion is not in scope (no DELETE endpoint). Orders reference `user_id` but don't have a foreign key (different DB). If added: orders would become orphaned, which is acceptable in a microservice architecture (soft deletes preferred). |
| 4 | Should the outbox worker use polling or PostgreSQL LISTEN/NOTIFY? | Polling (every 5s). LISTEN/NOTIFY is more real-time but adds complexity and requires persistent DB connections. Polling is simpler and sufficient. |
| 5 | Should the Reliability Console authenticate users? | No. It authenticates with the service APIs using `X-Admin-Key` stored in localStorage. No user login system for the console itself. |
| 6 | Should there be a user activity endpoint on User Service? | We'll add `GET /users/:id/activity` as a convenience for Postman testing to verify that the async flow completed. This is a minor addition that helps with evidence collection. |
