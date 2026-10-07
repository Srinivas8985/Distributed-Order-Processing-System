# Phase 0 — Technical Specification Index

## Distributed Order Processing & Reliability Platform

> **Status:** Phase 0 Complete — Ready for Implementation  
> **Date:** 2026-10-07  
> **Version:** 1.0

---

## Document Index

| # | Section | Document | Key Contents |
|---|---------|----------|-------------|
| 0 | Executive Summary | [00-executive-summary.md](./00-executive-summary.md) | Project scope, two-plane architecture, technology stack, phase overview |
| 1 | Requirements | [01-requirements.md](./01-requirements.md) | 23 mandatory + 9 enhanced functional requirements, 10 non-functional requirements |
| 2 | Architecture | [02-architecture.md](./02-architecture.md) | System diagram, component descriptions, communication paths (sync + async), data flows |
| 3 | Service Boundaries & Database | [03-service-boundaries-and-database.md](./03-service-boundaries-and-database.md) | Ownership rules, 7 table schemas with columns/types/constraints/indexes |
| 4 | API Contracts | [04-api-contracts.md](./04-api-contracts.md) | All endpoints: User Service (5), Order Service (4), Admin (5), Simulation (5) |
| 5 | Idempotency Design | [05-idempotency-design.md](./05-idempotency-design.md) | Idempotency-Key flow, concurrent handling, request hashing, lifecycle |
| 6 | Resilience Design | [06-resilience-design.md](./06-resilience-design.md) | Timeout (3s), retry (3×), exponential backoff, circuit breaker, error classification |
| 7 | RabbitMQ Design | [07-rabbitmq-design.md](./07-rabbitmq-design.md) | Topology, EVENT contract, ACK behavior, DLQ, delivery guarantees, crash recovery |
| 8 | Outbox Design | [08-outbox-design.md](./08-outbox-design.md) | Outbox workflow, worker design, status transitions, guarantees & non-guarantees |
| 9 | Replay, Simulation & Console | [09-replay-simulation-console.md](./09-replay-simulation-console.md) | Event replay mechanism, fault injection design, dashboard page/component specs |
| 10 | Observability & Security | [10-observability-security.md](./10-observability-security.md) | Structured logging, metrics, correlation IDs, auth, validation, CORS, rate limiting |
| 11 | Failure Matrix | [11-failure-matrix.md](./11-failure-matrix.md) | 18 failure scenarios with expected behavior, DB state, response, logs, recovery |
| 12 | Postman Test Plan | [12-postman-test-plan.md](./12-postman-test-plan.md) | 10 test folders, detailed test specs, assertions, evidence collection plan |
| 13 | Test Strategy | [13-test-strategy.md](./13-test-strategy.md) | 7 test layers, file organization, requirements traceability matrix |
| 14 | Docker & Project Structure | [14-docker-and-structure.md](./14-docker-and-structure.md) | 6 containers, networks, volumes, env vars, health checks, repository layout |
| 15 | Architectural Trade-offs | [15-architectural-tradeoffs.md](./15-architectural-tradeoffs.md) | 9 chosen technologies with rationale, 9 rejected alternatives with reasoning |
| 16 | Implementation Phases | [16-implementation-phases.md](./16-implementation-phases.md) | 8 implementation phases, consistency review (7/7 checks pass), open questions |

---

## Specification Coverage Summary

| Assignment Requirement | Spec Section | API Contract | DB Schema | Test Plan | Failure Scenario |
|----------------------|-------------|-------------|-----------|-----------|------------------|
| User CRUD | §2, §3 | §4 (2.1, 2.2) | §3 (users) | §12 (F01), §13 | §11 (S1) |
| Order CRUD | §2, §3 | §4 (3.1, 3.2) | §3 (orders, order_items) | §12 (F02), §13 | §11 (S1) |
| User verification | §2 | §4 (2.3) | — | §12 (F03), §13 | §11 (S2-S7) |
| Service auth | §10 | §4 (2.3 headers) | — | §12 (F03), §13 | §11 (S18) |
| Timeout | §6 | — | — | §12 (F05), §13 | §11 (S3) |
| Retries | §6 | — | — | §12 (F05), §13 | §11 (S6) |
| Graceful failure | §6 | §4 (3.1 errors) | — | §12 (F05), §13 | §11 (S2-S4, S7) |
| Idempotency | §5 | §4 (3.1 headers) | §3 (idempotency_keys) | §12 (F04), §13 | §11 (S16, S17) |
| ORDER_CREATED event | §7 | — | §3 (outbox_events) | §12 (F06), §13 | §11 (S8-S10) |
| RabbitMQ | §7 | — | — | §12 (F06), §13 | §11 (S8, S11-S14) |
| User activity | §3 | — | §3 (activity_history) | §12 (F06), §13 | §11 (S1, S12) |
| Data ownership | §3 | — | §3 (separate DBs) | — | — |
| Outbox Pattern | §8 | §4 (4.1-4.3) | §3 (outbox_events) | §12 (F07), §13 | §11 (S8-S10) |
| Docker Compose | §14 | — | — | — | — |
| .env.example | §14 | — | — | — | — |
| Postman collection | §12 | — | — | §12 | — |
| README | §15 | — | — | — | — |
| Architecture diagram | §2 | — | — | — | — |
| Tests | §13 | — | — | §13 | — |
| Failure Simulation | §9B | §4 (5.1-5.5) | — | §12 (F05, F10) | §11 (S3, S4) |
| Event Replay | §9A | §4 (4.3) | — | §12 (F08) | §11 (S15) |
| Reliability Console | §9C | — | — | — | — |

**All 23 mandatory and 9 enhanced requirements are covered across specification, API contracts, database schemas, test plans, and failure scenarios.**

---

## How to Use This Specification

1. **Start with the Executive Summary** (§0) for project overview.
2. **Read Architecture** (§2) for system understanding.
3. **Implement phase-by-phase** following §16's phase breakdown.
4. **Reference API Contracts** (§4) when building endpoints.
5. **Reference Database Design** (§3) when writing Prisma schemas.
6. **Reference Failure Matrix** (§11) when implementing error handling.
7. **Reference Postman Test Plan** (§12) when building the collection.
8. **Use the Traceability Matrix** (§13) to verify all requirements are implemented.
