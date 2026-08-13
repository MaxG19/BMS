# Business Management System — Backend

The backend service for the Business Management System (BMS).

The backend is responsible for business logic, authentication, authorization, data persistence, API endpoints, and integration with the BMS database.

## Technology Stack

| Technology | Purpose |
|---|---|
| NestJS | Backend application framework |
| TypeScript | Application language |
| PostgreSQL 18 | Relational database |
| Prisma ORM | Database access and schema migrations |
| Docker | Local infrastructure |
| Jest | Testing |

---

# 1. Project Setup

## Prerequisites

The following must be installed before working on the backend:

- Node.js
- npm
- Docker Desktop

PostgreSQL is provided through Docker for local development, so PostgreSQL does not need to be installed directly on the host machine.

## Install Dependencies

From the `Backend` directory:

```bash
npm install