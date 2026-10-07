# Phase 0 — Docker Architecture & Project Structure

## Part A: Docker Compose Design

### 1. Container Architecture

| Container | Image | Port (Host) | Port (Container) | Purpose |
|-----------|-------|-------------|-------------------|---------|
| `user-service` | Custom (Dockerfile) | `3000` | `3000` | User Service API + RabbitMQ Consumer |
| `order-service` | Custom (Dockerfile) | `3001` | `3001` | Order Service API + Outbox Worker |
| `user-db` | `postgres:16-alpine` | `5432` | `5432` | User Service PostgreSQL |
| `order-db` | `postgres:16-alpine` | `5433` | `5432` | Order Service PostgreSQL |
| `rabbitmq` | `rabbitmq:3.13-management-alpine` | `5672`, `15672` | `5672`, `15672` | Message broker + management UI |
| `reliability-console` | Custom (Dockerfile) | `3002` | `3000` | Next.js dashboard |

### 2. Networks

| Network | Type | Connected Containers |
|---------|------|---------------------|
| `app-network` | `bridge` | All containers |

**Design note:** A single network is sufficient for this project. In production, you might separate database networks from application networks, but for a Docker Compose demo, this adds complexity without benefit.

### 3. Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `user-db-data` | `/var/lib/postgresql/data` | Persist User DB data across restarts |
| `order-db-data` | `/var/lib/postgresql/data` | Persist Order DB data across restarts |
| `rabbitmq-data` | `/var/lib/rabbitmq` | Persist RabbitMQ state (queues, messages) |

### 4. Environment Variables

#### User Service

| Variable | Example Value | Description |
|----------|--------------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | HTTP server port |
| `DATABASE_URL` | `postgresql://user:password@user-db:5432/userdb` | PostgreSQL connection |
| `RABBITMQ_URL` | `amqp://guest:guest@rabbitmq:5672` | RabbitMQ connection |
| `SERVICE_AUTH_TOKEN` | `dev-service-token-2024` | Shared secret for service-to-service auth |
| `ADMIN_API_KEY` | `dev-admin-key-2024` | Admin API key |
| `LOG_LEVEL` | `info` | Pino log level |

#### Order Service

| Variable | Example Value | Description |
|----------|--------------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3001` | HTTP server port |
| `DATABASE_URL` | `postgresql://user:password@order-db:5432/orderdb` | PostgreSQL connection |
| `RABBITMQ_URL` | `amqp://guest:guest@rabbitmq:5672` | RabbitMQ connection |
| `USER_SERVICE_URL` | `http://user-service:3000` | User Service base URL (internal Docker network) |
| `SERVICE_AUTH_TOKEN` | `dev-service-token-2024` | Shared secret |
| `ADMIN_API_KEY` | `dev-admin-key-2024` | Admin API key |
| `LOG_LEVEL` | `info` | Pino log level |
| `USER_SERVICE_TIMEOUT_MS` | `3000` | Timeout for User Service calls |
| `MAX_RETRIES` | `3` | Max retry attempts |
| `CB_FAILURE_THRESHOLD` | `5` | Circuit breaker failure threshold |
| `CB_RESET_TIMEOUT_MS` | `30000` | Circuit breaker reset timeout |
| `OUTBOX_POLL_INTERVAL_MS` | `5000` | Outbox worker polling interval |
| `IDEMPOTENCY_KEY_TTL_HOURS` | `24` | Idempotency key retention |

#### Reliability Console

| Variable | Example Value | Description |
|----------|--------------|-------------|
| `NEXT_PUBLIC_USER_SERVICE_URL` | `http://localhost:3000` | User Service URL (from browser) |
| `NEXT_PUBLIC_ORDER_SERVICE_URL` | `http://localhost:3001` | Order Service URL (from browser) |

### 5. Health Checks

```yaml
user-db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U user -d userdb"]
    interval: 5s
    timeout: 5s
    retries: 5

order-db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U user -d orderdb"]
    interval: 5s
    timeout: 5s
    retries: 5

rabbitmq:
  healthcheck:
    test: ["CMD-SHELL", "rabbitmq-diagnostics check_port_connectivity"]
    interval: 10s
    timeout: 10s
    retries: 5

user-service:
  healthcheck:
    test: ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 3

order-service:
  healthcheck:
    test: ["CMD-SHELL", "curl -f http://localhost:3001/health || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 3
```

### 6. Dependencies and Startup Order

```yaml
user-service:
  depends_on:
    user-db:
      condition: service_healthy
    rabbitmq:
      condition: service_healthy

order-service:
  depends_on:
    order-db:
      condition: service_healthy
    rabbitmq:
      condition: service_healthy

reliability-console:
  depends_on:
    user-service:
      condition: service_healthy
    order-service:
      condition: service_healthy
```

### 7. Restart Policy

| Container | Policy | Rationale |
|-----------|--------|-----------|
| `user-db` | `unless-stopped` | Database should always be available |
| `order-db` | `unless-stopped` | Database should always be available |
| `rabbitmq` | `unless-stopped` | Broker should always be available |
| `user-service` | `on-failure` | Restart on crash, but not on intentional stop |
| `order-service` | `on-failure` | Restart on crash, but not on intentional stop |
| `reliability-console` | `on-failure` | Non-critical; restart on crash |

---

## Part B: Project Structure

```
distributed-order-processing/
│
├── services/
│   ├── user-service/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── index.ts              # Environment config with Zod validation
│   │   │   ├── middleware/
│   │   │   │   ├── error-handler.ts       # Global error handler
│   │   │   │   ├── request-id.ts          # Request/Correlation ID middleware
│   │   │   │   ├── auth.ts                # Service-to-service auth middleware
│   │   │   │   ├── admin-auth.ts          # Admin API key middleware
│   │   │   │   ├── rate-limiter.ts        # Rate limiting middleware
│   │   │   │   ├── validation.ts          # Zod validation middleware
│   │   │   │   └── simulation.ts          # Failure simulation middleware
│   │   │   ├── routes/
│   │   │   │   ├── user.routes.ts         # Public user endpoints
│   │   │   │   ├── internal.routes.ts     # Internal verification endpoint
│   │   │   │   ├── health.routes.ts       # Health and readiness
│   │   │   │   ├── admin.routes.ts        # Admin metrics and simulation
│   │   │   │   └── index.ts              # Route aggregator
│   │   │   ├── services/
│   │   │   │   └── user.service.ts        # User business logic
│   │   │   ├── consumers/
│   │   │   │   └── order-event.consumer.ts # RabbitMQ consumer for ORDER_CREATED
│   │   │   ├── lib/
│   │   │   │   ├── logger.ts              # Pino logger setup
│   │   │   │   ├── prisma.ts              # Prisma client singleton
│   │   │   │   ├── rabbitmq.ts            # RabbitMQ connection manager
│   │   │   │   └── metrics.ts             # In-memory metrics counters
│   │   │   ├── schemas/
│   │   │   │   └── user.schema.ts         # Zod schemas for user endpoints
│   │   │   ├── types/
│   │   │   │   └── index.ts              # Shared TypeScript types
│   │   │   ├── __tests__/
│   │   │   │   ├── unit/
│   │   │   │   │   └── validation.test.ts
│   │   │   │   ├── integration/
│   │   │   │   │   ├── user.routes.test.ts
│   │   │   │   │   ├── auth.middleware.test.ts
│   │   │   │   │   └── consumer.test.ts
│   │   │   │   └── setup.ts
│   │   │   └── app.ts                    # Express app setup
│   │   │   └── server.ts                 # Server entry point
│   │   ├── prisma/
│   │   │   └── schema.prisma             # User DB schema
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── Dockerfile
│   │
│   └── order-service/
│       ├── src/
│       │   ├── config/
│       │   │   └── index.ts
│       │   ├── middleware/
│       │   │   ├── error-handler.ts
│       │   │   ├── request-id.ts
│       │   │   ├── admin-auth.ts
│       │   │   ├── rate-limiter.ts
│       │   │   ├── validation.ts
│       │   │   └── idempotency.ts         # Idempotency-Key enforcement
│       │   ├── routes/
│       │   │   ├── order.routes.ts
│       │   │   ├── health.routes.ts
│       │   │   ├── admin.routes.ts        # Event management + simulation
│       │   │   └── index.ts
│       │   ├── services/
│       │   │   ├── order.service.ts
│       │   │   └── user-verification.service.ts  # HTTP client to User Service
│       │   ├── lib/
│       │   │   ├── logger.ts
│       │   │   ├── prisma.ts
│       │   │   ├── rabbitmq.ts
│       │   │   ├── metrics.ts
│       │   │   ├── circuit-breaker.ts     # Circuit breaker implementation
│       │   │   ├── retry.ts               # Retry with exponential backoff
│       │   │   └── http-client.ts         # Resilient HTTP client (timeout + retry + CB)
│       │   ├── workers/
│       │   │   └── outbox.worker.ts       # Outbox polling and publishing
│       │   ├── schemas/
│       │   │   └── order.schema.ts        # Zod schemas for order endpoints
│       │   ├── types/
│       │   │   └── index.ts
│       │   ├── __tests__/
│       │   │   ├── unit/
│       │   │   │   ├── idempotency.test.ts
│       │   │   │   ├── circuit-breaker.test.ts
│       │   │   │   ├── retry.test.ts
│       │   │   │   └── order-total.test.ts
│       │   │   ├── integration/
│       │   │   │   ├── order.routes.test.ts
│       │   │   │   ├── idempotency.routes.test.ts
│       │   │   │   ├── outbox.test.ts
│       │   │   │   └── resilience.test.ts
│       │   │   └── setup.ts
│       │   ├── app.ts
│       │   └── server.ts
│       ├── prisma/
│       │   └── schema.prisma             # Order DB schema
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── Dockerfile
│
├── reliability-console/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                  # Dashboard
│   │   │   ├── events/
│   │   │   │   └── page.tsx              # Event management
│   │   │   ├── simulation/
│   │   │   │   └── page.tsx              # Failure simulation controls
│   │   │   └── lifecycle/
│   │   │       └── page.tsx              # Request lifecycle viewer
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Header.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── HealthCard.tsx
│   │   │   │   ├── MetricCard.tsx
│   │   │   │   ├── CircuitBreakerWidget.tsx
│   │   │   │   └── OutboxGauge.tsx
│   │   │   ├── events/
│   │   │   │   ├── EventTable.tsx
│   │   │   │   ├── EventDetailModal.tsx
│   │   │   │   └── StatusBadge.tsx
│   │   │   ├── simulation/
│   │   │   │   ├── SimulationCard.tsx
│   │   │   │   └── ResetAllButton.tsx
│   │   │   └── lifecycle/
│   │   │       ├── OrderLookup.tsx
│   │   │       └── LifecycleTimeline.tsx
│   │   ├── hooks/
│   │   │   ├── useHealth.ts
│   │   │   ├── useMetrics.ts
│   │   │   ├── useEvents.ts
│   │   │   └── useSimulation.ts
│   │   └── lib/
│   │       ├── api.ts                    # API client
│   │       └── types.ts                  # Shared types
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── Dockerfile
│
├── postman/
│   ├── Distributed-Order-Processing.postman_collection.json
│   └── Distributed-Order-Processing.postman_environment.json
│
├── docs/
│   ├── phase-0/                          # This specification
│   │   ├── 00-executive-summary.md
│   │   ├── 01-requirements.md
│   │   ├── 02-architecture.md
│   │   ├── ...
│   │   └── 16-implementation-phases.md
│   └── architecture-diagram.png          # Visual architecture diagram
│
├── infrastructure/
│   └── rabbitmq/
│       └── definitions.json              # RabbitMQ exchange/queue pre-configuration
│
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
└── package.json                          # Root workspace (if using npm workspaces)
```

### Directory Purpose Summary

| Directory | Purpose |
|-----------|---------|
| `services/user-service/` | User Service: CRUD, internal verification, RabbitMQ consumer, activity management |
| `services/order-service/` | Order Service: CRUD, idempotency, resilient user verification, outbox, event management |
| `reliability-console/` | Next.js dashboard for system observability and control |
| `postman/` | Postman collection and environment files |
| `docs/` | Architecture documentation, Phase 0 specification |
| `docs/phase-0/` | This complete technical specification |
| `infrastructure/` | Infrastructure configuration (RabbitMQ definitions) |

### Why This Structure

1. **Service isolation:** Each service is a self-contained Node.js project with its own `package.json`, `tsconfig.json`, and Prisma schema. Changes to one service don't affect the other.
2. **Consistent internal structure:** Both services follow the same directory layout (config, middleware, routes, services, lib, schemas, types, tests).
3. **Separation of concerns:** Routes handle HTTP, services handle business logic, lib handles infrastructure.
4. **Test co-location:** Tests live next to the code they test, organized by type (unit, integration).
5. **Shared nothing:** No shared code between services. Any shared types (like the event contract) are defined independently in each service, because in a real microservice architecture, services should be independently deployable.
