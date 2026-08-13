# Backend Architecture Conventions

## 1. Architecture Overview

The BMS backend follows a domain-oriented modular architecture.

Top-level structure:

src/
+-- app/
+-- config/
+-- common/
+-- database/
+-- modules/
+-- main.ts

Business domains are organized under:

src/modules/

Initial domains:

- identity
- organization
- business
- workspace

Additional domains such as product, inventory, sales, payments, and reporting may be added later without restructuring existing modules.

## 2. Module Structure

Each domain module follows this structure:

<domain>/
+-- application/
+-- controllers/
+-- domain/
+-- dto/
+-- infrastructure/

### application/

Contains application/use-case logic that coordinates operations within the domain.

### controllers/

Contains HTTP controllers and route definitions for the domain.

Controllers handle HTTP concerns and delegate application work to application services.

### domain/

Contains domain models, business rules, domain services, and domain-level abstractions.

### dto/

Contains Data Transfer Objects used to define data entering or leaving application boundaries.

### infrastructure/

Contains implementations that connect the domain/application layers to external technologies such as Prisma, PostgreSQL, Redis, or other infrastructure services.

## 3. Controllers

Controllers are responsible for:

- Defining HTTP routes
- Receiving HTTP requests
- Receiving validated DTOs
- Delegating operations to application services
- Returning results

Controllers should not contain substantial business logic or direct database queries.

## 4. Application Services

Application services coordinate application use cases.

They may:

- Coordinate domain operations
- Call repositories
- Invoke domain services
- Coordinate multiple operations
- Return application results

Application services should not contain HTTP-specific concerns.

## 5. Domain Services

Domain services contain business rules that do not naturally belong to a single domain entity or value object.

Domain services must remain independent of HTTP and infrastructure concerns.

## 6. DTOs

DTOs define the shape of data transferred across application boundaries.

DTOs are used for:

- Request payloads
- Query parameters
- Path parameters where appropriate
- Response contracts where appropriate

DTOs should not be treated as database entities.

## 7. Guards

Guards control whether a request is allowed to continue through the request pipeline.

Shared guards belong under:

src/common/guards/

Domain-specific guards belong inside their respective domain module.

## 8. Repositories

Repositories provide the application's/domain's interface for persistence and retrieval of data.

Repository abstractions belong close to the domain/application layer where appropriate.

Infrastructure-specific implementations belong under the module's infrastructure layer.

Prisma-specific database access belongs in infrastructure/database-related implementations.

## 9. Shared Code

Code belongs under src/common/ only when it is genuinely shared across multiple domains.

Examples include:

- Shared guards
- Shared filters
- Shared interceptors
- Shared decorators
- Shared pipes
- Shared utilities

Domain-specific functionality must remain inside its owning module.

## 10. Dependency Direction

The preferred dependency direction is:

HTTP
?
Controllers
?
Application
?
Domain
?
Infrastructure
?
External systems

Domain logic should not depend directly on HTTP or infrastructure technologies.

## 11. Adding a New Domain

When a new business domain is introduced, create it under:

src/modules/<domain>/

The module should follow the established internal structure and conventions rather than modifying the existing top-level architecture.

## 12. Current Domains

The initial backend domains are:

- Identity
- Organization
- Business
- Workspace

Future domains may include:

- Product
- Inventory
- Sales
- Payments
- Reporting

These should be added as independent modules when their implementation work begins.
