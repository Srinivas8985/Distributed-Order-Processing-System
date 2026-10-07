# Phase 0 — Architectural Trade-offs

## 1. What We Chose and Why

### 1.1 Microservices (vs Monolith)

**Choice:** Two independent services with separate databases and processes.

**Why for this project:**
- The assignment explicitly requires two independent services with separate databases.
- Demonstrates real distributed-systems challenges: network failures, eventual consistency, service discovery.
- A monolith would reduce the project to two CRUD endpoints with shared database queries — no distributed-systems concerns to demonstrate.

**Trade-off:** Microservices add operational complexity (Docker, networking, deployment coordination). For a 2-entity system, a monolith would be faster to build. We accept this complexity because it's the point of the assignment.

### 1.2 REST / HTTP (vs gRPC, GraphQL)

**Choice:** REST with JSON over HTTP for synchronous communication.

**Why for this project:**
- **Universally understood:** Evaluators can test with Postman, curl, or any HTTP client.
- **Simple debugging:** HTTP requests/responses are human-readable JSON.
- **Postman requirement:** The assignment requires a Postman collection. gRPC (binary protobuf) is harder to test with Postman.
- **Sufficient performance:** For user verification (simple GET), REST latency (~50ms) is negligible.

**What we lose:** gRPC offers schema enforcement (protobuf), streaming, and lower serialization overhead. GraphQL offers flexible querying. Neither benefit is meaningful for a single `GET /verify` call.

### 1.3 RabbitMQ (vs Kafka, Redis Pub/Sub)

**Choice:** RabbitMQ as the message broker.

**Why for this project:**
- **Purpose-built for message queuing:** Acknowledgements, DLQ, durable queues are first-class features.
- **At-least-once delivery:** ACK-based delivery is straightforward to implement and reason about.
- **Assignment appropriate:** The system has one event type (ORDER_CREATED), one producer, one consumer. RabbitMQ's queuing model is a natural fit.
- **Lightweight:** Starts quickly in Docker, low resource usage.

**Why NOT Kafka:**
- Kafka is optimized for high-throughput event streaming with consumer groups, partitions, and offset management. Our system processes ~1 event per order — Kafka's complexity is unjustified.
- Kafka requires ZooKeeper (or KRaft) and has a steeper operational learning curve.
- Kafka's log-based model complicates DLQ and individual message replay.
- Kafka would be appropriate if we had hundreds of consumers, high throughput, or event sourcing requirements.

**Why NOT Redis Pub/Sub:**
- Redis Pub/Sub is fire-and-forget: if no consumer is listening, the message is lost.
- No persistence, no ACK, no DLQ. Fails our at-least-once requirement.
- Redis Streams would work but adds complexity over RabbitMQ for a single-queue use case.

### 1.4 PostgreSQL (vs MongoDB, MySQL)

**Choice:** PostgreSQL with Prisma ORM.

**Why for this project:**
- **ACID transactions:** The Outbox Pattern requires atomic commits across the orders and outbox_events tables. PostgreSQL provides this natively.
- **UNIQUE constraints:** Idempotency and event deduplication rely on database-enforced uniqueness.
- **JSONB:** Flexible storage for event payloads and activity metadata without sacrificing relational structure.
- **Prisma compatibility:** Prisma has excellent PostgreSQL support with type-safe queries.

**Why NOT MongoDB:**
- MongoDB's transaction support (multi-document) is newer and more limited.
- The data model (users, orders, items) is inherently relational.
- UNIQUE constraints and referential integrity are weaker in MongoDB.

### 1.5 Outbox Pattern (vs Alternatives)

**Choice:** Transactional Outbox with polling worker.

**Why for this project:**
- Solves the dual-write problem without introducing additional infrastructure.
- Only requires PostgreSQL (already needed for business data).
- Conceptually simple: one table, one worker, one poll loop.
- Well-documented pattern with clear trade-offs.

**Alternatives considered:**

| Alternative | Why Not |
|------------|---------|
| Change Data Capture (CDC) via Debezium | Requires Kafka Connect, additional containers. Over-engineering for one event type. |
| Transaction log tailing | Requires PostgreSQL logical replication setup. Fragile and database-specific. |
| Direct publish with retry | Doesn't guarantee atomicity between DB and broker. Events can be lost. |
| Distributed transactions (2PC) | RabbitMQ doesn't support XA. Slow and brittle. |

**Trade-off:** The outbox worker introduces polling delay (5s). Events are not published in real-time. For this use case (activity history), sub-second delivery is not required.

### 1.6 Eventual Consistency (vs Strong Consistency)

**Choice:** The activity_history in User Service is eventually consistent with order creation.

**Why:**
- User activity is a secondary concern — it doesn't affect order processing.
- Strong consistency would require a distributed transaction or synchronous call, coupling the services' availability.
- With the Outbox Pattern and at-least-once delivery, activity is guaranteed to be recorded eventually.

**What this means:**
- For a brief window (seconds), an order exists but the activity record does not.
- If a client queries the user's activity immediately after order creation, the record may not be there yet.
- This is an acceptable trade-off: we chose availability over immediate consistency (AP in CAP theorem terms).

### 1.7 Prisma ORM (vs Raw SQL, TypeORM, Knex)

**Choice:** Prisma for database access.

**Why:**
- Type-safe database queries integrated with TypeScript.
- Schema-as-code (Prisma schema) with migration generation.
- Clean transaction API (`prisma.$transaction()`).
- Good PostgreSQL support.

**Trade-off:** Prisma's query builder doesn't support all PostgreSQL features (e.g., `INSERT ON CONFLICT` requires raw SQL). For the outbox worker's `UPDATE ... RETURNING`, we may need Prisma's `$queryRaw`. This is acceptable.

### 1.8 TypeScript (vs JavaScript)

**Choice:** TypeScript throughout.

**Why:**
- Compile-time type checking catches errors before runtime.
- Zod + TypeScript provides end-to-end type safety from request validation to database queries.
- Better IDE support and refactoring.
- Industry standard for Node.js backend projects.

### 1.9 Docker Compose (vs Kubernetes, Manual Setup)

**Choice:** Docker Compose for local orchestration.

**Why:**
- Assignment requirement.
- Single command (`docker compose up`) starts the entire system.
- Evaluator doesn't need Node.js, PostgreSQL, or RabbitMQ installed locally.
- Reproducible environment.

**Why NOT Kubernetes:**
- K8s requires a cluster (minikube/kind), kubectl, and significant YAML configuration.
- For a local demo/assignment, Docker Compose is universally available and simpler.
- The project doesn't need horizontal scaling, rolling deployments, or service mesh.

---

## 2. What We Intentionally Did NOT Choose

### 2.1 Kafka

Not chosen because RabbitMQ provides sufficient message queuing for our single event type. See Section 1.3.

### 2.2 Shared Database

Not chosen because it violates the assignment requirement and eliminates the distributed-systems challenges we're demonstrating.

### 2.3 Distributed Transactions (2PC)

Not chosen because RabbitMQ doesn't support XA, and the Outbox Pattern achieves the same practical result. See Section 1.5.

### 2.4 Synchronous Communication for Activity History

Not chosen because activity recording is a side effect that should not couple Order Service's availability to User Service's consumer processing. See Section 1.6.

### 2.5 Arbitrary Infrastructure-Level Fault Injection

Not chosen because:
- Docker-level fault injection (killing containers, dropping network packets) requires privileged access.
- It's harder to control and reset.
- It affects all endpoints, including health checks and admin APIs.
- Application-level fault flags provide more precise, safer, and easier-to-demonstrate failure simulation.

### 2.6 API Gateway

Not chosen because:
- Two services don't justify an API gateway's complexity.
- Routing, auth, and rate limiting are handled at the service level.
- An API gateway (Kong, Traefik) would add another container and configuration surface.

### 2.7 Service Mesh (Istio, Linkerd)

Not chosen because:
- Requires Kubernetes.
- Adds latency and complexity for mTLS, traffic management, and observability that can be demonstrated more simply at the application level.

### 2.8 External Metrics System (Prometheus + Grafana)

Not chosen because:
- Adds two more containers and significant configuration.
- Our in-memory metrics exposed via `/admin/metrics` are sufficient for the Reliability Console.
- The console polls the APIs directly — no need for a separate metrics pipeline.
- If needed in the future, the in-memory counters can be exposed in Prometheus format with minimal changes.

### 2.9 Centralized Logging (ELK Stack)

Not chosen because:
- Elasticsearch + Logstash + Kibana would triple the container count.
- Docker Compose `docker compose logs` provides sufficient log access for a demo.
- Structured JSON logs (Pino) are already machine-parseable.
