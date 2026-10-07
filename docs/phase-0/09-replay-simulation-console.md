# Phase 0 — Event Replay, Failure Simulation & Reliability Console Design

## Part A: Event Replay Design

### 1. Purpose

When an event fails to be published (Outbox) or fails to be processed (Consumer), an administrator needs to:
1. Understand **why** it failed
2. **Fix** the underlying issue (e.g., restart RabbitMQ, fix consumer bug)
3. **Replay** the event to complete the originally intended processing

### 2. Event States

| State | Source | Meaning |
|-------|--------|---------|
| `PENDING` | Outbox | Waiting to be published to RabbitMQ |
| `PROCESSING` | Outbox Worker | Currently being published |
| `PUBLISHED` | Outbox Worker | Successfully delivered to RabbitMQ |
| `FAILED` | Outbox Worker | Max publish attempts exceeded |
| `DLQ` | Consumer / Manual | Consumer couldn't process; message sent to dead-letter queue |

### 3. Replay Mechanism

**API:** `POST /admin/events/:id/replay`

**Flow:**
```
1. Admin identifies a FAILED or DLQ event via GET /admin/events
2. Admin inspects event details via GET /admin/events/:id
3. Admin fixes the underlying issue (restarts service, fixes data, etc.)
4. Admin calls POST /admin/events/:id/replay
5. Server validates event is in FAILED or DLQ status
6. Server resets:
   - status → PENDING
   - attempts → 0
   - next_retry_at → NULL
   - last_error → NULL
7. Outbox worker picks up the event on next poll cycle
8. Event is re-published to RabbitMQ
9. Consumer processes the event
```

### 4. Preventing Duplicate Activity on Replay

**Scenario:** An event was published successfully (PUBLISHED), the consumer processed it and created an `activity_history` record, but the event was manually moved to DLQ for testing. Replaying it would create a duplicate activity record.

**Prevention:**
- Consumer checks `processed_events` table before processing.
- If `eventId` already exists in `processed_events`, the event is ACKed without creating a duplicate activity record.
- This is the same consumer-side idempotency that handles normal RabbitMQ redeliveries.

**Key insight:** Replay safety is a consequence of consumer-side idempotency, not a separate mechanism. The consumer doesn't know (or care) whether a message is an original delivery or a replay.

### 5. Replay Limitations

- Replay only resets the outbox event. It does NOT:
  - Modify the original order
  - Reverse any existing activity records
  - Bypass the normal publish → consume flow
- Replay requires the underlying issue to be fixed first. Replaying a poisoned event without fixing the root cause will just fail again.

---

## Part B: Failure Simulation Engine Design

### 1. Purpose

The Failure Simulation Engine allows controlled injection of specific failure modes into the running system. Its purpose is strictly educational and demonstrative:

- Show how timeout handling works (simulate User Service hanging)
- Show how circuit breaker activates (simulate User Service returning 503)
- Show how events accumulate when consumer is paused
- Show how DLQ works when consumer fails

### 2. Architecture: Application-Level Fault Flags

Failures are injected via **in-memory flags** set through admin API calls. No infrastructure is actually destroyed.

```typescript
// Conceptual — not implementation code
interface SimulationState {
  timeout: { enabled: boolean; durationMs: number };
  delay: { enabled: boolean; delayMs: number };
  error: { enabled: boolean };
  consumer: 'running' | 'paused' | 'fail_next';
}
```

Each simulation flag is checked by a **middleware** or **guard** on the relevant endpoint/consumer:

```
Request → [Simulation Middleware] → [Business Logic]
                 │
                 ├─ timeout enabled? → delay(durationMs), never respond
                 ├─ delay enabled? → delay(delayMs), then proceed
                 ├─ error enabled? → return 503 immediately
                 └─ none active? → proceed normally
```

### 3. Simulation Scenarios

#### 3.1 Timeout Simulation

| Aspect | Detail |
|--------|--------|
| **Activated by** | `POST /admin/simulate/timeout` on User Service |
| **Affects** | `GET /internal/users/:id/verify` endpoint only |
| **Behavior** | The endpoint receives the request but never responds (holds the connection open until the caller's timeout fires) |
| **Implementation** | Middleware detects `timeout.enabled`, enters `await sleep(durationMs)`. The caller (Order Service) times out at 3000ms. |
| **Reset** | `POST /admin/simulate/reset` or `POST /admin/simulate/timeout { "enabled": false }` |
| **Observable effect** | Order Service logs timeout errors, retries, eventually returns 503. Circuit breaker may open. |

#### 3.2 Delay Simulation

| Aspect | Detail |
|--------|--------|
| **Activated by** | `POST /admin/simulate/delay` on User Service |
| **Affects** | `GET /internal/users/:id/verify` endpoint only |
| **Behavior** | Adds artificial delay before normal processing (the response eventually arrives) |
| **Implementation** | Middleware detects `delay.enabled`, `await sleep(delayMs)`, then proceeds to actual verification |
| **Observable effect** | Slower order creation. If delay > timeout, becomes a timeout. |

#### 3.3 Error Simulation (503)

| Aspect | Detail |
|--------|--------|
| **Activated by** | `POST /admin/simulate/error` on User Service |
| **Affects** | `GET /internal/users/:id/verify` endpoint only |
| **Behavior** | Returns 503 immediately |
| **Implementation** | Middleware detects `error.enabled`, returns 503 response immediately |
| **Observable effect** | Order Service retries, eventually returns 503 to client. Circuit breaker may open. |

#### 3.4 Consumer Pause/Fail

| Aspect | Detail |
|--------|--------|
| **Activated by** | `POST /admin/simulate/consumer` on User Service |
| **Actions** | `pause` — stop consuming, messages accumulate in queue |
| | `resume` — resume consuming |
| | `fail_next` — next N messages will be nacked → DLQ |
| **Implementation** | `pause`: cancel the RabbitMQ consumer channel. `resume`: re-register consumer. `fail_next`: set a counter; consumer nacks until counter reaches 0. |
| **Observable effect** | `pause`: RabbitMQ management UI shows growing queue depth. `fail_next`: messages appear in DLQ. |

### 4. Safety Constraints

| Constraint | Implementation |
|------------|---------------|
| Environment restriction | Simulation endpoints return 403 when `NODE_ENV` is not `development` or `demo` |
| Authentication | Requires `X-Admin-Key` header |
| Scope limitation | Only affects specific endpoints/consumers, never business data or database |
| No remote code execution | Only predefined fault modes; no arbitrary command execution |
| State visibility | `GET /admin/simulate/status` returns current simulation state |
| Auto-reset | Optional: simulations auto-reset after a configurable duration (default: 5 minutes) |

### 5. Why Application-Level Fault Injection

**Alternative considered:** Docker-level fault injection (stopping containers, dropping network packets with `tc`).

**Why we chose application-level:**
- Doesn't require root/privileged access
- Faster to activate/deactivate
- Doesn't affect health checks or admin endpoints
- Can be precisely targeted (only verification endpoint, not all of User Service)
- Safe to use in demos — container stays healthy, just the specific behavior changes
- Easier to test in CI

---

## Part C: Reliability Console Design

### 1. Purpose

A Next.js dashboard that provides a visual interface for the Control Plane. It helps an evaluator understand the distributed system's behavior by showing health, events, metrics, and simulation controls in one place.

### 2. Technology

| Aspect | Choice |
|--------|--------|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS v4 |
| Data fetching | Server components + client-side polling (SWR or React Query) |
| State | React state (no external store needed) |

### 3. Pages and Components

#### 3.1 Dashboard Page (`/`)

**Purpose:** Overview of system health and key metrics.

**Sections:**

| Section | Data Source | Content |
|---------|------------|---------|
| System Health | `GET /health` on both services | Service status cards (UP/DOWN), database status, RabbitMQ status |
| Key Metrics | `GET /admin/metrics` on both services | Orders created, orders failed, events published, events failed, DLQ count |
| Circuit Breaker | `GET /admin/metrics` on Order Service | Current state (CLOSED/OPEN/HALF-OPEN), failure count, last state change |
| Outbox Status | `GET /admin/metrics` on Order Service | Pending count, published total, failed count |

**Components:**
- `HealthCard` — Shows service name, status indicator (green/red/yellow), uptime
- `MetricCard` — Shows metric name, value, optional trend indicator
- `CircuitBreakerWidget` — Shows state with visual indicator, failure count, state timeline
- `OutboxGauge` — Shows pending/published/failed counts

**Polling interval:** 5 seconds for health, 10 seconds for metrics.

---

#### 3.2 Events Page (`/events`)

**Purpose:** Browse, inspect, and manage outbox events.

**Sections:**

| Section | Content |
|---------|---------|
| Event List | Paginated table of events with status filters |
| Event Detail Modal | Full event details including payload, errors, attempts |
| Replay Action | Button to replay FAILED/DLQ events |

**Components:**
- `EventTable` — Sortable, filterable table with columns: ID (truncated), Type, Status (badge), Attempts, Created At, Published At
- `StatusFilter` — Dropdown/tabs for PENDING, PROCESSING, PUBLISHED, FAILED, DLQ
- `EventDetailModal` — Shows full event payload (syntax-highlighted JSON), error messages, attempt count
- `ReplayButton` — Calls `POST /admin/events/:id/replay`, shows confirmation dialog, updates status

---

#### 3.3 Simulation Page (`/simulation`)

**Purpose:** Control failure injection.

**Sections:**

| Section | Content |
|---------|---------|
| Current State | Shows which simulations are active |
| Simulation Controls | Toggle buttons for each simulation type |
| Instructions | Brief explanation of what each simulation does |

**Components:**
- `SimulationCard` — For each simulation type: name, description, toggle/activate button, current state indicator
- `ResetAllButton` — Calls reset on both services
- `SimulationLog` — Optional: shows a feed of recent simulation activations/deactivations

---

#### 3.4 Request Lifecycle Page (`/lifecycle`)

**Purpose:** Visualize the journey of a single order request through the system.

**Sections:**

| Section | Content |
|---------|---------|
| Order Lookup | Input field for order ID |
| Order Details | Order data, items, status |
| Event Lifecycle | Outbox event for this order: status, attempts, timestamps |
| Activity Status | Whether the activity record was created in User Service |

**Components:**
- `OrderLookup` — Input + search button
- `LifecycleTimeline` — Visual timeline showing: Order Created → Outbox Event Created → Published to RabbitMQ → Consumer Processed → Activity Created
- `StepDetail` — Click on a timeline step to see timestamps, logs, errors

---

### 4. Authentication

The console requires an admin key to access control-plane APIs. The key is:
- Entered by the user on first visit (stored in browser localStorage)
- Sent as `X-Admin-Key` header with every API request
- Not required for `/health` and `/ready` endpoints (those are public)

### 5. Responsive Design

The console should be usable on desktop screens (≥1024px). Mobile responsiveness is nice-to-have but not required for a demo/evaluation tool.

### 6. Console Does NOT

- Directly access any database
- Create users or orders (use Postman for that)
- Modify business data
- Run in production (it's a development/demo tool)
