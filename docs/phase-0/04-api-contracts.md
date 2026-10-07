# Phase 0 — API Contracts

## 1. Common Headers

### Request Headers (All Endpoints)

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes (POST) | `application/json` |
| `X-Request-ID` | No | Client-generated UUID for request tracing. Server generates one if absent. |
| `X-Correlation-ID` | No | Propagated across services for distributed tracing. Defaults to `X-Request-ID` if absent. |

### Response Headers (All Endpoints)

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Request-ID` | Echoed or server-generated request ID |
| `X-Correlation-ID` | Correlation ID for this request chain |

### Standard Error Response Shape

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {},
    "retryable": false
  },
  "requestId": "uuid",
  "timestamp": "ISO-8601"
}
```

---

## 2. User Service APIs (Port 3000)

### 2.1 POST /users

**Purpose:** Create a new user.

**Authentication:** None (public endpoint).

**Request Headers:**
| Header | Required |
|--------|----------|
| `Content-Type: application/json` | Yes |
| `X-Request-ID` | No |

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "Jane Doe"
}
```

**Validation Rules (Zod):**
- `email`: string, valid email format, max 255 chars, required
- `name`: string, min 1 char, max 255 chars, trimmed, required

**Success Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "name": "Jane Doe",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid email format, missing fields |
| 409 | `USER_ALREADY_EXISTS` | Email already registered |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

### 2.2 GET /users/:id

**Purpose:** Retrieve a user by ID.

**Authentication:** None (public endpoint).

**Path Parameters:**
- `id`: UUID (validated)

**Success Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "name": "Jane Doe",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid UUID format |
| 404 | `USER_NOT_FOUND` | No user with this ID |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

### 2.3 GET /internal/users/:id/verify

**Purpose:** Internal endpoint for Order Service to verify a user exists. Returns minimal user data needed by Order Service.

**Authentication:** Service-to-service via `X-Service-Auth` header.

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `X-Service-Auth` | Yes | Shared secret token (from `SERVICE_AUTH_TOKEN` env var) |
| `X-Correlation-ID` | Yes | Propagated from original request |

**Path Parameters:**
- `id`: UUID

**Success Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "name": "Jane Doe",
  "verified": true
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid UUID format |
| 401 | `UNAUTHORIZED` | Missing or invalid `X-Service-Auth` |
| 404 | `USER_NOT_FOUND` | No user with this ID |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `SERVICE_UNAVAILABLE` | Simulated failure (failure engine active) |

---

### 2.4 GET /health

**Purpose:** Liveness check. Returns 200 if the process is running.

**Authentication:** None.

**Success Response:** `200 OK`
```json
{
  "status": "ok",
  "service": "user-service",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600
}
```

---

### 2.5 GET /ready

**Purpose:** Readiness check. Returns 200 only if the service can accept traffic (database connected, etc.).

**Authentication:** None.

**Success Response:** `200 OK`
```json
{
  "status": "ready",
  "service": "user-service",
  "checks": {
    "database": "connected",
    "rabbitmq": "connected"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Failure Response:** `503 Service Unavailable`
```json
{
  "status": "not_ready",
  "service": "user-service",
  "checks": {
    "database": "disconnected",
    "rabbitmq": "connected"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 3. Order Service APIs (Port 3001)

### 3.1 POST /orders

**Purpose:** Create a new order. Verifies user via User Service, creates order with items, creates outbox event atomically.

**Authentication:** None (public endpoint).

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type: application/json` | Yes | |
| `Idempotency-Key` | Yes | Client-generated unique key for idempotent processing |
| `X-Request-ID` | No | |

**Request Body:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "items": [
    {
      "productName": "Wireless Mouse",
      "quantity": 2,
      "unitPrice": 29.99
    },
    {
      "productName": "USB-C Cable",
      "quantity": 1,
      "unitPrice": 12.50
    }
  ]
}
```

**Validation Rules (Zod):**
- `userId`: string, valid UUID, required
- `items`: array, min 1 item, max 50 items, required
- `items[].productName`: string, min 1 char, max 255 chars, required
- `items[].quantity`: integer, min 1, required
- `items[].unitPrice`: number, min 0, max 2 decimal places, required
- `Idempotency-Key` header: string, min 1 char, max 255 chars, required

**Success Response:** `201 Created`
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "CONFIRMED",
  "items": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440001",
      "productName": "Wireless Mouse",
      "quantity": 2,
      "unitPrice": 29.99
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "productName": "USB-C Cable",
      "quantity": 1,
      "unitPrice": 12.50
    }
  ],
  "totalAmount": 72.48,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid body or missing `Idempotency-Key` |
| 404 | `USER_NOT_FOUND` | User verification returned 404 |
| 409 | `IDEMPOTENCY_CONFLICT` | Same `Idempotency-Key` with different request body |
| 503 | `USER_SERVICE_UNAVAILABLE` | User Service unreachable after retries / circuit breaker open |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

**Idempotent Replay:** `200 OK` (same response body as original 201, but 200 status to indicate replay)

---

### 3.2 GET /orders/:id

**Purpose:** Retrieve an order by ID, including its items.

**Authentication:** None (public endpoint).

**Path Parameters:**
- `id`: UUID (validated)

**Success Response:** `200 OK`
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "CONFIRMED",
  "items": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440001",
      "productName": "Wireless Mouse",
      "quantity": 2,
      "unitPrice": 29.99
    }
  ],
  "totalAmount": 72.48,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid UUID format |
| 404 | `ORDER_NOT_FOUND` | No order with this ID |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

### 3.3 GET /health

**Purpose:** Liveness check.

**Success Response:** `200 OK`
```json
{
  "status": "ok",
  "service": "order-service",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600
}
```

---

### 3.4 GET /ready

**Purpose:** Readiness check. Checks database and RabbitMQ connectivity.

**Success Response:** `200 OK`
```json
{
  "status": "ready",
  "service": "order-service",
  "checks": {
    "database": "connected",
    "rabbitmq": "connected"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 4. Admin / Control Plane APIs

All admin endpoints require the `X-Admin-Key` header.

### Authentication

| Header | Required | Description |
|--------|----------|-------------|
| `X-Admin-Key` | Yes | Admin secret (from `ADMIN_API_KEY` env var) |

**Unauthorized Response:** `401 Unauthorized`
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing admin key"
  }
}
```

---

### 4.1 GET /admin/events (Order Service)

**Purpose:** List outbox events with filtering and pagination.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | (all) | Filter: `PENDING`, `PROCESSING`, `PUBLISHED`, `FAILED`, `DLQ` |
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page (max 100) |
| `sort` | string | `created_at:desc` | Sort field and direction |

**Success Response:** `200 OK`
```json
{
  "events": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "eventType": "ORDER_CREATED",
      "aggregateType": "ORDER",
      "aggregateId": "660e8400-e29b-41d4-a716-446655440000",
      "status": "PUBLISHED",
      "attempts": 1,
      "correlationId": "990e8400-e29b-41d4-a716-446655440000",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "publishedAt": "2024-01-15T10:30:05.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

### 4.2 GET /admin/events/:id (Order Service)

**Purpose:** Get full event details including payload, error info, and attempt history.

**Success Response:** `200 OK`
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440000",
  "eventType": "ORDER_CREATED",
  "aggregateType": "ORDER",
  "aggregateId": "660e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "orderId": "660e8400-e29b-41d4-a716-446655440000",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "totalAmount": 72.48,
    "itemCount": 2,
    "status": "CONFIRMED"
  },
  "status": "FAILED",
  "attempts": 5,
  "maxAttempts": 5,
  "lastError": "AMQP connection refused",
  "correlationId": "990e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "publishedAt": null,
  "nextRetryAt": null
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 404 | `EVENT_NOT_FOUND` | No event with this ID |

---

### 4.3 POST /admin/events/:id/replay (Order Service)

**Purpose:** Reset a `FAILED` or `DLQ` event back to `PENDING` for re-processing by the outbox worker.

**Request Body:** None required.

**Success Response:** `200 OK`
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440000",
  "previousStatus": "FAILED",
  "newStatus": "PENDING",
  "attempts": 0,
  "message": "Event queued for replay"
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 404 | `EVENT_NOT_FOUND` | No event with this ID |
| 409 | `EVENT_NOT_REPLAYABLE` | Event is not in `FAILED` or `DLQ` status |

---

### 4.4 GET /admin/metrics (Both Services)

**Purpose:** Return operational metrics for the Reliability Console.

**Success Response (Order Service):** `200 OK`
```json
{
  "service": "order-service",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "orders": {
    "createdTotal": 150,
    "failedTotal": 3
  },
  "userVerification": {
    "successTotal": 147,
    "failureTotal": 3,
    "avgLatencyMs": 45,
    "timeoutTotal": 2
  },
  "resilience": {
    "retryTotal": 8,
    "circuitBreaker": {
      "state": "CLOSED",
      "failureCount": 1,
      "lastStateChange": "2024-01-15T09:00:00.000Z"
    }
  },
  "outbox": {
    "pendingCount": 2,
    "publishedTotal": 148,
    "failedCount": 1,
    "dlqCount": 0
  }
}
```

**Success Response (User Service):** `200 OK`
```json
{
  "service": "user-service",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "users": {
    "createdTotal": 50
  },
  "consumer": {
    "processedTotal": 148,
    "duplicatesSkipped": 3,
    "failedTotal": 1
  },
  "activity": {
    "recordsTotal": 148
  }
}
```

---

## 5. Failure Simulation APIs

### 5.1 POST /admin/simulate/timeout (User Service)

**Purpose:** Enable simulated timeout — the `/internal/users/:id/verify` endpoint will hang indefinitely (or until the caller's timeout fires).

**Request Body:**
```json
{
  "enabled": true,
  "durationMs": 30000
}
```

**Success Response:** `200 OK`
```json
{
  "simulation": "timeout",
  "enabled": true,
  "durationMs": 30000,
  "message": "User verification will now hang for 30000ms"
}
```

---

### 5.2 POST /admin/simulate/delay (User Service)

**Purpose:** Add artificial latency to the verification endpoint.

**Request Body:**
```json
{
  "enabled": true,
  "delayMs": 2000
}
```

**Success Response:** `200 OK`
```json
{
  "simulation": "delay",
  "enabled": true,
  "delayMs": 2000,
  "message": "User verification will now respond with 2000ms delay"
}
```

---

### 5.3 POST /admin/simulate/error (User Service)

**Purpose:** Make the verification endpoint return 503 Service Unavailable.

**Request Body:**
```json
{
  "enabled": true
}
```

**Success Response:** `200 OK`
```json
{
  "simulation": "error",
  "enabled": true,
  "message": "User verification will now return 503"
}
```

---

### 5.4 POST /admin/simulate/consumer (User Service)

**Purpose:** Pause or fail the RabbitMQ consumer.

**Request Body:**
```json
{
  "action": "pause"
}
```

Valid actions: `pause`, `resume`, `fail_next`

**Success Response:** `200 OK`
```json
{
  "simulation": "consumer",
  "action": "pause",
  "message": "Consumer paused — messages will accumulate in queue"
}
```

---

### 5.5 POST /admin/simulate/reset (Both Services)

**Purpose:** Clear all active simulations and return to normal operation.

**Request Body:** None.

**Success Response:** `200 OK`
```json
{
  "message": "All simulations cleared",
  "simulations": {
    "timeout": false,
    "delay": false,
    "error": false,
    "consumer": "running"
  }
}
```

---

## 6. Environment Restrictions for Simulation APIs

Simulation endpoints **MUST** only be active when `NODE_ENV` is `development` or `demo`. In `production`, these endpoints return `403 Forbidden`:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Simulation endpoints are disabled in production"
  }
}
```

This ensures failure simulation cannot be accidentally or maliciously invoked in production.
