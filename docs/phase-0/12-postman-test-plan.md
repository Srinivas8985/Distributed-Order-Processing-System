# Phase 0 — Postman Test Plan

## 1. Collection Structure

```
Distributed Order Processing System/
├── 01 - User Service/
│   ├── Create User - Valid
│   ├── Create User - Duplicate Email
│   ├── Create User - Invalid Body
│   ├── Get User - Valid
│   ├── Get User - Not Found
│   └── Get User - Invalid UUID
├── 02 - Order Service/
│   ├── Create Order - Valid
│   ├── Create Order - Invalid Body
│   ├── Create Order - Missing Idempotency Key
│   ├── Get Order - Valid
│   ├── Get Order - Not Found
│   └── Get Order - Invalid UUID
├── 03 - Authentication/
│   ├── Internal Verify - Valid Auth
│   ├── Internal Verify - Missing Auth
│   ├── Internal Verify - Invalid Auth
│   ├── Admin API - Valid Key
│   └── Admin API - Invalid Key
├── 04 - Idempotency/
│   ├── Create Order - First Request
│   ├── Create Order - Duplicate Key Same Body
│   ├── Create Order - Duplicate Key Different Body
│   └── Create Order - New Key Same Body
├── 05 - Resilience/
│   ├── Setup - Simulate Timeout
│   ├── Create Order - During Timeout
│   ├── Teardown - Reset Simulations
│   ├── Setup - Simulate 503
│   ├── Create Order - During 503
│   ├── Teardown - Reset Simulations
│   ├── Setup - Simulate Delay (2s)
│   ├── Create Order - During Delay (should succeed)
│   └── Teardown - Reset Simulations
├── 06 - RabbitMQ Events/
│   ├── Create Order (triggers event)
│   ├── Wait 10s
│   ├── Verify Activity Created
│   └── Get Admin Events - Verify Published
├── 07 - Outbox/
│   ├── Get Admin Events - List All
│   ├── Get Admin Events - Filter by Status
│   └── Get Admin Event Detail
├── 08 - Event Replay/
│   ├── Setup - Pause Consumer
│   ├── Create Order (event published, not consumed)
│   ├── Get Admin Events - Verify Published
│   ├── Setup - Resume Consumer
│   ├── Wait 10s
│   ├── Verify Activity Created
│   ├── Setup - Simulate Consumer Fail
│   ├── Create Order (event will fail)
│   ├── Wait 10s
│   ├── Get Admin Events - Verify FAILED/DLQ
│   ├── Teardown - Reset Simulations
│   ├── Replay Failed Event
│   ├── Wait 10s
│   └── Verify Activity Created After Replay
├── 09 - Health/
│   ├── User Service Health
│   ├── User Service Ready
│   ├── Order Service Health
│   ├── Order Service Ready
│   └── Admin Metrics
└── 10 - Failure Scenarios/
    ├── Full Happy Path (End-to-End)
    ├── User Service Down - Order Fails Gracefully
    ├── Concurrent Duplicate Orders
    └── Poison Message → DLQ
```

## 2. Collection Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USER_SERVICE_URL` | `http://localhost:3000` | User Service base URL |
| `ORDER_SERVICE_URL` | `http://localhost:3001` | Order Service base URL |
| `SERVICE_AUTH_TOKEN` | `dev-service-token-2024` | Service-to-service auth |
| `ADMIN_API_KEY` | `dev-admin-key-2024` | Admin API key |
| `testUserId` | (set by test) | ID of user created during tests |
| `testOrderId` | (set by test) | ID of order created during tests |
| `testEventId` | (set by test) | ID of outbox event |
| `idempotencyKey` | (set by test) | UUID generated per test run |

---

## 3. Detailed Test Specifications

### Folder 01 — User Service

#### Test: Create User - Valid

| Aspect | Detail |
|--------|--------|
| **Method** | `POST` |
| **URL** | `{{USER_SERVICE_URL}}/users` |
| **Headers** | `Content-Type: application/json` |
| **Body** | `{ "email": "test-{{$timestamp}}@example.com", "name": "Test User" }` |
| **Expected Status** | `201` |
| **Assertions** | `pm.response.to.have.status(201)`, `pm.expect(json.id).to.be.a('string')`, `pm.expect(json.email).to.include('@')`, `pm.expect(json.name).to.equal('Test User')` |
| **Post-script** | `pm.collectionVariables.set('testUserId', json.id)` |
| **Evidence** | Screenshot: 201 response with user data |

#### Test: Create User - Duplicate Email

| Aspect | Detail |
|--------|--------|
| **Method** | `POST` |
| **URL** | `{{USER_SERVICE_URL}}/users` |
| **Body** | Same email as previous test |
| **Expected Status** | `409` |
| **Assertions** | `pm.response.to.have.status(409)`, `pm.expect(json.error.code).to.equal('USER_ALREADY_EXISTS')` |

#### Test: Create User - Invalid Body

| Aspect | Detail |
|--------|--------|
| **Body** | `{ "email": "not-an-email", "name": "" }` |
| **Expected Status** | `400` |
| **Assertions** | `pm.response.to.have.status(400)`, `pm.expect(json.error.code).to.equal('VALIDATION_ERROR')` |

#### Test: Get User - Valid

| Aspect | Detail |
|--------|--------|
| **Method** | `GET` |
| **URL** | `{{USER_SERVICE_URL}}/users/{{testUserId}}` |
| **Expected Status** | `200` |
| **Assertions** | `pm.expect(json.id).to.equal(pm.collectionVariables.get('testUserId'))` |

#### Test: Get User - Not Found

| Aspect | Detail |
|--------|--------|
| **URL** | `{{USER_SERVICE_URL}}/users/00000000-0000-0000-0000-000000000000` |
| **Expected Status** | `404` |

#### Test: Get User - Invalid UUID

| Aspect | Detail |
|--------|--------|
| **URL** | `{{USER_SERVICE_URL}}/users/not-a-uuid` |
| **Expected Status** | `400` |

---

### Folder 02 — Order Service

#### Test: Create Order - Valid

| Aspect | Detail |
|--------|--------|
| **Method** | `POST` |
| **URL** | `{{ORDER_SERVICE_URL}}/orders` |
| **Headers** | `Content-Type: application/json`, `Idempotency-Key: {{$guid}}` |
| **Body** | `{ "userId": "{{testUserId}}", "items": [{ "productName": "Test Product", "quantity": 2, "unitPrice": 19.99 }] }` |
| **Expected Status** | `201` |
| **Assertions** | `pm.expect(json.id).to.be.a('string')`, `pm.expect(json.userId).to.equal(pm.collectionVariables.get('testUserId'))`, `pm.expect(json.status).to.equal('CONFIRMED')`, `pm.expect(json.totalAmount).to.equal(39.98)`, `pm.expect(json.items).to.have.lengthOf(1)` |
| **Post-script** | `pm.collectionVariables.set('testOrderId', json.id)` |
| **Evidence** | Screenshot: 201 response with order data |

#### Test: Create Order - Missing Idempotency Key

| Aspect | Detail |
|--------|--------|
| **Headers** | No `Idempotency-Key` header |
| **Expected Status** | `400` |
| **Assertions** | `pm.expect(json.error.code).to.equal('VALIDATION_ERROR')` |

---

### Folder 03 — Authentication

#### Test: Internal Verify - Valid Auth

| Aspect | Detail |
|--------|--------|
| **Method** | `GET` |
| **URL** | `{{USER_SERVICE_URL}}/internal/users/{{testUserId}}/verify` |
| **Headers** | `X-Service-Auth: {{SERVICE_AUTH_TOKEN}}` |
| **Expected Status** | `200` |
| **Assertions** | `pm.expect(json.verified).to.be.true` |

#### Test: Internal Verify - Missing Auth

| Aspect | Detail |
|--------|--------|
| **Headers** | No `X-Service-Auth` |
| **Expected Status** | `401` |

#### Test: Internal Verify - Invalid Auth

| Aspect | Detail |
|--------|--------|
| **Headers** | `X-Service-Auth: wrong-token` |
| **Expected Status** | `401` |

#### Test: Admin API - Valid Key

| Aspect | Detail |
|--------|--------|
| **Method** | `GET` |
| **URL** | `{{ORDER_SERVICE_URL}}/admin/events` |
| **Headers** | `X-Admin-Key: {{ADMIN_API_KEY}}` |
| **Expected Status** | `200` |

#### Test: Admin API - Invalid Key

| Aspect | Detail |
|--------|--------|
| **Headers** | `X-Admin-Key: wrong-key` |
| **Expected Status** | `401` |

---

### Folder 04 — Idempotency

#### Test: Create Order - First Request

| Aspect | Detail |
|--------|--------|
| **Pre-script** | `pm.collectionVariables.set('idempotencyKey', pm.variables.replaceIn('{{$guid}}'))` |
| **Headers** | `Idempotency-Key: {{idempotencyKey}}` |
| **Expected Status** | `201` |

#### Test: Create Order - Duplicate Key Same Body

| Aspect | Detail |
|--------|--------|
| **Headers** | `Idempotency-Key: {{idempotencyKey}}` (same as previous) |
| **Same Body** | Yes |
| **Expected Status** | `200` (not 201 — idempotent replay) |
| **Assertions** | `pm.expect(json.id).to.equal(pm.collectionVariables.get('testOrderId'))` (same order returned) |
| **Evidence** | Screenshot: 200 response proving idempotency |

#### Test: Create Order - Duplicate Key Different Body

| Aspect | Detail |
|--------|--------|
| **Headers** | `Idempotency-Key: {{idempotencyKey}}` (same key) |
| **Body** | Different items |
| **Expected Status** | `409` |
| **Assertions** | `pm.expect(json.error.code).to.equal('IDEMPOTENCY_CONFLICT')` |
| **Evidence** | Screenshot: 409 proving conflict detection |

---

### Folder 05 — Resilience

#### Test: Create Order During Timeout

| Aspect | Detail |
|--------|--------|
| **Pre-requisite** | Run "Setup - Simulate Timeout" first |
| **Expected Status** | `503` |
| **Assertions** | `pm.expect(json.error.code).to.equal('USER_SERVICE_UNAVAILABLE')`, `pm.expect(json.error.retryable).to.be.true` |
| **Expected duration** | > 7 seconds (timeout × retries + backoff) |
| **Evidence** | Screenshot: 503 response + timing showing retries occurred |

---

### Folder 06 — RabbitMQ Events

#### Test: Verify Activity Created

| Aspect | Detail |
|--------|--------|
| **Method** | `GET` |
| **URL** | `{{USER_SERVICE_URL}}/users/{{testUserId}}` (or a dedicated activity endpoint if added) |
| **Pre-requisite** | Order created, wait 10s for async processing |
| **Expected Status** | `200` |
| **Evidence** | Proof that asynchronous event processing completed |

---

### Folder 08 — Event Replay

#### Test: Replay Failed Event

| Aspect | Detail |
|--------|--------|
| **Method** | `POST` |
| **URL** | `{{ORDER_SERVICE_URL}}/admin/events/{{testEventId}}/replay` |
| **Headers** | `X-Admin-Key: {{ADMIN_API_KEY}}` |
| **Expected Status** | `200` |
| **Assertions** | `pm.expect(json.newStatus).to.equal('PENDING')` |
| **Evidence** | Screenshot: Event replay + subsequent activity creation |

---

### Folder 09 — Health

#### Test: User Service Health

| Aspect | Detail |
|--------|--------|
| **Method** | `GET` |
| **URL** | `{{USER_SERVICE_URL}}/health` |
| **Expected Status** | `200` |
| **Assertions** | `pm.expect(json.status).to.equal('ok')` |

---

### Folder 10 — Failure Scenarios (End-to-End)

#### Test: Full Happy Path

**Sequence:**
1. Create User → 201
2. Create Order → 201
3. Wait 10s
4. Verify event PUBLISHED
5. Verify activity created

This is the single most important test for demonstrating the complete system.

#### Test: User Service Down - Order Fails Gracefully

**Sequence:**
1. Simulate error on User Service
2. Create Order → 503
3. Reset simulations
4. Create Order with same key → 201 (new attempt after reset)

---

## 4. Evidence Collection Plan

| # | Requirement | Test | Evidence Type |
|---|------------|------|---------------|
| 1 | User CRUD | 01-Create/Get User | Screenshot of 201 + 200 |
| 2 | Order CRUD | 02-Create/Get Order | Screenshot of 201 + 200 |
| 3 | Service-to-service auth | 03-Auth tests | Screenshot of 200 (valid) + 401 (invalid) |
| 4 | Idempotency | 04-All idempotency tests | Screenshot of 201 → 200 → 409 |
| 5 | Timeout handling | 05-Timeout test | Screenshot of 503 + timing |
| 6 | Retries | 05-503/Timeout tests | Server logs showing retry attempts |
| 7 | Graceful failure | 05-Resilience tests | Screenshot of 503 with retryable=true |
| 8 | Async event | 06-Event tests | Screenshot of event in PUBLISHED status |
| 9 | User activity | 06-Activity verification | Screenshot of activity record |
| 10 | Outbox Pattern | 07-Outbox tests | Screenshot of outbox events list |
| 11 | Event replay | 08-Replay tests | Screenshot of FAILED → PENDING → PUBLISHED |
| 12 | DLQ | 08-Consumer fail test | Screenshot of DLQ message |
| 13 | Health checks | 09-Health tests | Screenshot of health + ready responses |
