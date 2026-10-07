# Phase 0 — Executive Summary

## Project Name

**Distributed Order Processing & Reliability Platform**

## Purpose

This project demonstrates production-grade distributed-systems engineering through two independent microservices (User Service and Order Service) augmented by a dedicated Control Plane for observability, failure simulation, and event recovery.

## Scope

| Dimension | Description |
|-----------|-------------|
| **Business Plane** | User Service, Order Service, their databases, RabbitMQ messaging, order processing, user-activity tracking |
| **Control Plane** | Reliability Console (Next.js dashboard), Failure Simulation Engine, Event Replay System, health/metrics APIs |
| **Infrastructure** | Docker Compose orchestration of all services, databases, and RabbitMQ |
| **Evidence** | Postman collection, architecture diagram, README, automated tests |

## Key Distributed-Systems Concerns

1. **Service-to-service communication** — synchronous REST with timeout, retry, exponential backoff, and circuit breaker.
2. **Asynchronous event processing** — RabbitMQ with at-least-once delivery, durable queues, DLQ.
3. **Data consistency** — Outbox Pattern guaranteeing atomic order-creation + event-publication.
4. **Idempotency** — `Idempotency-Key` header with database-level uniqueness and request-hash verification.
5. **Failure handling** — graceful degradation when User Service is unavailable; dead-letter queue for poison messages; event replay for recovery.
6. **Observability** — structured logging (Pino), correlation IDs, health/readiness endpoints, metrics.

## What Makes This More Than Two CRUD APIs

| Enhancement | Distributed-Systems Purpose |
|-------------|---------------------------|
| Failure Simulation Engine | Controlled fault injection (timeout, delay, 503, consumer pause) to demonstrate resilience patterns without destroying infrastructure |
| Event Replay System | Administrative recovery of failed/DLQ events with consumer-side deduplication to prevent duplicate side effects |
| Reliability Console | Visual control-plane dashboard showing circuit-breaker state, outbox health, retry/timeout statistics, event lifecycle, and failure-simulation controls |

## Technology Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Runtime | Node.js + TypeScript | Assignment requirement; excellent async I/O for microservices |
| HTTP Framework | Express.js | Lightweight, widely understood, sufficient for REST APIs |
| Database | PostgreSQL + Prisma ORM | Relational integrity for transactional outbox; Prisma provides type-safe schema management |
| Messaging | RabbitMQ | Purpose-built message broker with acknowledgements, DLQ, durable queues |
| Validation | Zod | Runtime type validation with TypeScript inference |
| Logging | Pino | High-performance structured JSON logging |
| Testing | Vitest + Supertest | Fast unit/integration testing with HTTP assertion support |
| Console | Next.js + Tailwind CSS | Server-rendered React dashboard with utility-first styling |
| Infrastructure | Docker + Docker Compose | Assignment requirement; reproducible multi-service orchestration |

## Implementation Phases (Preview)

| Phase | Scope |
|-------|-------|
| **Phase 0** (this document) | Architecture, contracts, design decisions |
| **Phase 1** | Project scaffold, Docker Compose, database schemas, health endpoints |
| **Phase 2** | User Service CRUD, service-to-service auth |
| **Phase 3** | Order Service CRUD, idempotency, user verification with resilience |
| **Phase 4** | Outbox Pattern, RabbitMQ producer, ORDER_CREATED event |
| **Phase 5** | RabbitMQ consumer, user activity, DLQ, consumer idempotency |
| **Phase 6** | Event Replay, Failure Simulation Engine, admin APIs |
| **Phase 7** | Reliability Console (Next.js dashboard) |
| **Phase 8** | Postman collection, tests, documentation, architecture diagram |
