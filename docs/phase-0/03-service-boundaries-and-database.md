# Phase 0 — Service Boundaries & Database Design

## 1. Service Boundaries

### 1.1 User Service Owns

| Resource | Rationale |
|----------|-----------|
| `users` table | User is the core domain entity of this service |
| `activity_history` table | Activity is a user-centric concern; it records what happened to a user |
| `processed_events` table | Consumer-side deduplication is the consumer's responsibility |

### 1.2 Order Service Owns

| Resource | Rationale |
|----------|-----------|
| `orders` table | Order is the core domain entity of this service |
| `order_items` table | Items belong to an order; they are part of the Order aggregate |
| `idempotency_keys` table | Idempotency is enforced at the order-creation entry point |
| `outbox_events` table | The Outbox Pattern requires the event record to live in the same database as the order so they can be committed atomically |

### 1.3 Why No Cross-Service Database Access

1. **Coupling:** If Order Service queried User DB directly, any schema change in User DB would require coordinated deployment of both services. This eliminates the primary benefit of microservices.
2. **Encapsulation:** User Service is the authority on user data. It can enforce validation, authorization, and business rules. Direct DB access bypasses all of this.
3. **Scalability:** Each service can scale its database independently. Cross-service queries create shared bottlenecks.
4. **Failure isolation:** If User DB goes down, only User Service is directly affected. Order Service experiences a degraded-but-defined failure path (503 on user verification), not a database connection error.

---

## 2. Database Design

### 2.1 User Database

#### Table: `users`

**Purpose:** Stores registered users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Unique user identifier |
| `email` | `VARCHAR(255)` | `NOT NULL`, `UNIQUE` | User email address |
| `name` | `VARCHAR(255)` | `NOT NULL` | User display name |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | Last update timestamp |

**Indexes:**
- `PK` on `id`
- `UNIQUE` index on `email`

---

#### Table: `activity_history`

**Purpose:** Records user activity triggered by events from other services (e.g., order creation). This is the "user activity/history" required by the assignment.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Unique activity record |
| `user_id` | `UUID` | `NOT NULL`, `REFERENCES users(id)` | The user this activity belongs to |
| `activity_type` | `VARCHAR(50)` | `NOT NULL` | Type of activity (e.g., `ORDER_CREATED`) |
| `reference_id` | `UUID` | `NOT NULL` | The ID of the referenced entity (e.g., order ID) |
| `metadata` | `JSONB` | `DEFAULT '{}'` | Additional event data (order total, item count, etc.) |
| `event_id` | `UUID` | `NOT NULL` | The ID of the event that triggered this activity |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | When the activity was recorded |

**Indexes:**
- `PK` on `id`
- Index on `user_id` (frequent lookups by user)
- Index on `(user_id, activity_type)` (filter by type)
- Index on `event_id` (for correlation/debugging)

---

#### Table: `processed_events`

**Purpose:** Consumer-side idempotency. Tracks which event IDs have already been processed to prevent duplicate activity records when the same message is delivered more than once (at-least-once delivery).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `event_id` | `UUID` | `PRIMARY KEY` | The event ID from the message; uniqueness ensures exactly-once processing |
| `event_type` | `VARCHAR(50)` | `NOT NULL` | The type of event |
| `processed_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | When the event was processed |

**Indexes:**
- `PK` on `event_id` (serves as the uniqueness check)

**Why this table exists:**
RabbitMQ guarantees at-least-once delivery, not exactly-once. If a consumer processes a message but crashes before ACKing, RabbitMQ redelivers. Without `processed_events`, the consumer would insert a duplicate `activity_history` record. By checking/inserting into `processed_events` within the same transaction as the `activity_history` insert, we achieve effective exactly-once processing.

---

### 2.2 Order Database

#### Table: `orders`

**Purpose:** Stores customer orders.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Unique order identifier |
| `user_id` | `UUID` | `NOT NULL` | The user who placed the order (references User Service, NOT a foreign key) |
| `status` | `VARCHAR(20)` | `NOT NULL`, `DEFAULT 'CONFIRMED'` | Order status: `CONFIRMED`, `PROCESSING`, `COMPLETED`, `CANCELLED` |
| `total_amount` | `DECIMAL(12,2)` | `NOT NULL` | Order total |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | Order creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | Last update timestamp |

**Indexes:**
- `PK` on `id`
- Index on `user_id` (lookup orders by user)
- Index on `status` (filter by status)
- Index on `created_at` (sort by date)

**Note:** `user_id` is NOT a foreign key because the user lives in a different database. Order Service verified the user's existence via HTTP before creating the order. This is a fundamental consequence of database-per-service ownership.

---

#### Table: `order_items`

**Purpose:** Line items within an order.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Unique item identifier |
| `order_id` | `UUID` | `NOT NULL`, `REFERENCES orders(id) ON DELETE CASCADE` | Parent order |
| `product_name` | `VARCHAR(255)` | `NOT NULL` | Name of the product |
| `quantity` | `INTEGER` | `NOT NULL`, `CHECK (quantity > 0)` | Quantity ordered |
| `unit_price` | `DECIMAL(12,2)` | `NOT NULL`, `CHECK (unit_price >= 0)` | Price per unit |

**Indexes:**
- `PK` on `id`
- Index on `order_id` (join with orders)

---

#### Table: `idempotency_keys`

**Purpose:** Stores idempotency keys to prevent duplicate order creation. When a client retries with the same `Idempotency-Key`, the previously stored response is returned without re-executing the operation.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Internal record identifier |
| `key` | `VARCHAR(255)` | `NOT NULL`, `UNIQUE` | The idempotency key from the request header |
| `request_hash` | `VARCHAR(64)` | `NOT NULL` | SHA-256 hash of the request body; detects same key with different payload |
| `response_code` | `INTEGER` | `NOT NULL` | HTTP status code of the original response |
| `response_body` | `JSONB` | `NOT NULL` | Serialized response body |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | When the key was first used |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL` | When this record can be cleaned up (e.g., created_at + 24h) |

**Indexes:**
- `PK` on `id`
- `UNIQUE` index on `key` (the critical constraint — database-level enforcement)
- Index on `expires_at` (for cleanup jobs)

**Concurrency handling:**
The `UNIQUE` constraint on `key` means that if two concurrent requests arrive with the same idempotency key, only one `INSERT` will succeed. The other will receive a unique-constraint violation, at which point it can `SELECT` the existing record and return the cached response. This is why application-level "check then insert" is insufficient — see Section 8 of the Idempotency Design document.

---

#### Table: `outbox_events`

**Purpose:** Implements the Outbox Pattern. Event records are inserted in the same transaction as the order, guaranteeing that if the order exists, the event exists. A background worker polls this table and publishes events to RabbitMQ.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Unique event identifier (becomes `eventId` in the message) |
| `event_type` | `VARCHAR(50)` | `NOT NULL` | Event type (e.g., `ORDER_CREATED`) |
| `aggregate_type` | `VARCHAR(50)` | `NOT NULL` | Aggregate type (e.g., `ORDER`) |
| `aggregate_id` | `UUID` | `NOT NULL` | ID of the aggregate (e.g., order ID) |
| `payload` | `JSONB` | `NOT NULL` | Full event payload |
| `status` | `VARCHAR(20)` | `NOT NULL`, `DEFAULT 'PENDING'` | Event status: `PENDING`, `PROCESSING`, `PUBLISHED`, `FAILED`, `DLQ` |
| `attempts` | `INTEGER` | `NOT NULL`, `DEFAULT 0` | Number of publish attempts |
| `max_attempts` | `INTEGER` | `NOT NULL`, `DEFAULT 5` | Maximum publish attempts before marking FAILED |
| `last_error` | `TEXT` | `NULL` | Last error message from publish attempt |
| `correlation_id` | `UUID` | `NOT NULL` | Request correlation ID for tracing |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | Event creation time |
| `published_at` | `TIMESTAMPTZ` | `NULL` | When the event was successfully published |
| `next_retry_at` | `TIMESTAMPTZ` | `NULL` | When the next publish attempt should occur (for exponential backoff) |

**Indexes:**
- `PK` on `id`
- Index on `status` (worker queries PENDING/FAILED events)
- Index on `(status, next_retry_at)` (worker query with backoff)
- Index on `aggregate_id` (lookup events for a specific order)
- Index on `correlation_id` (trace events by request)
- Index on `created_at` (admin event list sorting)

**Status transitions:**
```
PENDING → PROCESSING → PUBLISHED  (happy path)
PENDING → PROCESSING → PENDING    (publish failed, retries remain)
PENDING → PROCESSING → FAILED     (max attempts exceeded)
FAILED  → PENDING                  (manual replay)
DLQ     → PENDING                  (manual replay from DLQ)
```

---

## 3. Cross-Cutting Design Notes

### 3.1 UUID vs Auto-Increment
UUIDs are used for all primary keys because:
- They can be generated client-side or at any service without coordination.
- They prevent information leakage (sequential IDs reveal order counts).
- They are safe across database boundaries (Order Service stores `user_id` as a UUID without needing User DB's sequence).

### 3.2 TIMESTAMPTZ
All timestamps use `TIMESTAMPTZ` (timestamp with time zone) to avoid timezone ambiguity. Stored in UTC internally by PostgreSQL.

### 3.3 JSONB for Flexible Data
`metadata` in `activity_history` and `payload` in `outbox_events` use `JSONB` for structured but flexible data that doesn't need relational normalization. PostgreSQL's JSONB supports indexing if needed later.

### 3.4 No Soft Deletes
For simplicity, we do not implement soft deletes. The assignment does not require DELETE endpoints. If added later, a `deleted_at` column with a partial unique index would be the approach.
