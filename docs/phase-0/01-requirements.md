# Phase 0 — Requirements Specification

## 1. Functional Requirements

### 1.1 Mandatory (Assignment)

| ID | Requirement | Category |
|----|------------|----------|
| FR-01 | User Service: `POST /users` — create a user | CRUD |
| FR-02 | User Service: `GET /users/:id` — retrieve a user | CRUD |
| FR-03 | User Service owns its own database | Data ownership |
| FR-04 | Order Service: `POST /orders` — create an order | CRUD |
| FR-05 | Order Service: `GET /orders/:id` — retrieve an order | CRUD |
| FR-06 | Order Service owns its own database | Data ownership |
| FR-07 | Order Service verifies user existence via HTTP call to User Service | Service communication |
| FR-08 | Service-to-service authentication | Security |
| FR-09 | Timeout handling on inter-service calls | Resilience |
| FR-10 | Limited retries with backoff | Resilience |
| FR-11 | Graceful failure when User Service is unavailable | Resilience |
| FR-12 | Idempotency via `Idempotency-Key` header | Correctness |
| FR-13 | Asynchronous `ORDER_CREATED` event | Messaging |
| FR-14 | RabbitMQ as message broker | Messaging |
| FR-15 | User activity/history updated on order creation | Business logic |
| FR-16 | No cross-service database access | Data ownership |
| FR-17 | Outbox Pattern for event publishing consistency | Data consistency |
| FR-18 | Docker Compose for orchestration | Infrastructure |
| FR-19 | `.env.example` for environment configuration | Infrastructure |
| FR-20 | Postman collection | Evidence |
| FR-21 | README with architectural explanations | Evidence |
| FR-22 | Architecture diagram | Evidence |
| FR-23 | Basic tests | Testing |

### 1.2 Enhanced (Our Additions)

| ID | Requirement | Category | Justification |
|----|------------|----------|---------------|
| FR-E01 | Failure Simulation Engine — inject timeout, delay, 503, consumer pause | Control Plane | Demonstrate resilience patterns without destroying infrastructure |
| FR-E02 | Event Replay System — inspect and replay failed/DLQ events | Control Plane | Demonstrate recovery from event-processing failures |
| FR-E03 | Reliability Console — visual dashboard for system health, events, simulation | Control Plane | Give evaluator a visual understanding of distributed behavior |
| FR-E04 | Circuit breaker on User Service calls | Resilience | Prevent cascade failures and retry storms |
| FR-E05 | Dead-letter queue for poison messages | Messaging | Isolate unprocessable messages from blocking the queue |
| FR-E06 | Health and readiness endpoints | Observability | Distinguish "alive" from "ready to serve traffic" |
| FR-E07 | Structured logging with correlation IDs | Observability | Trace requests across service boundaries |
| FR-E08 | Consumer-side event deduplication | Correctness | Prevent duplicate activity records from at-least-once delivery |
| FR-E09 | Admin authentication for control-plane APIs | Security | Prevent unauthorized fault injection |

## 2. Non-Functional Requirements

| ID | Requirement | Target |
|----|------------|--------|
| NFR-01 | Response latency (healthy path) | < 500ms for order creation |
| NFR-02 | Idempotency correctness | Identical response for duplicate requests |
| NFR-03 | Event delivery guarantee | At-least-once via Outbox + RabbitMQ |
| NFR-04 | Graceful degradation | Order Service responds with meaningful error when User Service is down |
| NFR-05 | Startup time | All services healthy within 30 seconds of `docker compose up` |
| NFR-06 | Log format | Structured JSON via Pino |
| NFR-07 | Test coverage | All major requirements covered by at least one test |
| NFR-08 | Security | No hard-coded secrets in source; service-to-service auth on internal endpoints |
| NFR-09 | Data isolation | Zero cross-service database queries |
| NFR-10 | Recovery | Failed events recoverable via replay without data duplication |
