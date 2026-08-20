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
```

---

# 2. Database Setup

The BMS backend uses PostgreSQL 18 running inside Docker.

## PostgreSQL Container

The local PostgreSQL container is:

```text
Container: bms-postgres
```

Image: `postgres:18`

Host: `localhost`

Port: `5433`

Database: `bms`

User: `bms_user`

Start the container:

```bash
docker start bms-postgres
```

Verify that the container is running:

```bash
docker ps --filter "name=bms-postgres"
```

The container should report a healthy/running status.

## Database Connection

The backend connects to PostgreSQL through the `DATABASE_URL` environment variable.

The local database is exposed at:

```text
localhost:5433
```

---

# 3. Prisma

The project uses Prisma ORM for database schema management, migrations, and database access.

## Validate the Prisma Schema

Run:

```bash
npx prisma validate
```

A successful validation should report:

```text
The schema at prisma/schema.prisma is valid
```

## Generate Prisma Client

Generate the Prisma Client after changing the Prisma schema or when setting up the project:

```bash
npx prisma generate
```

---

# 4. Database Migrations

All database migrations are stored in:

```text
prisma/migrations/
```

The migration history is committed to Git and is the source of truth for reconstructing the database schema.

## Apply Existing Migrations

To apply all committed migrations that have not yet been applied:

```bash
npx prisma migrate deploy
```

This command does not create new migrations. It applies the existing migration history.

## Check Migration Status

Run:

```bash
npx prisma migrate status
```

A correctly synchronized database should report:

```text
Database schema is up to date!
```

---

# 5. Database Seeding

The baseline database seed is located at:

```text
prisma/seed.ts
```

The seed is configured through `prisma.config.ts`:

```text
seed: "tsx prisma/seed.ts"
```

Run the seed with:

```bash
npx prisma db seed
```

A successful execution should report:

```text
Starting database seed...
```

Database seed completed successfully.

## Seeded RBAC Data

The seed creates the baseline role and permission data:

### Roles

- `OWNER`
- `MANAGER`
- `CASHIER`

### Permission Mappings

| Role | Permission Count |
|---|---:|
| OWNER | 17 |
| MANAGER | 14 |
| CASHIER | 6 |

The seed is idempotent. Running it more than once must not create duplicate baseline roles, permissions, or role-permission mappings.

---

# 6. Clean Database Setup

Use this procedure when creating a completely fresh local database or when verifying that the complete migration history can reconstruct the database from scratch.

> **Warning:** Dropping the database permanently removes all data in the local development database.

## Step 1 — Ensure PostgreSQL Is Running

```bash
docker start bms-postgres
```

Verify:

```bash
docker ps --filter "name=bms-postgres"
```

## Step 2 — Drop the Existing Database

Connect to the PostgreSQL server database rather than `bms`:

```bash
docker exec bms-postgres psql -U bms_user -d postgres -c "DROP DATABASE IF EXISTS bms;"
```

## Step 3 — Recreate the Database

```bash
docker exec bms-postgres psql -U bms_user -d postgres -c "CREATE DATABASE bms OWNER bms_user;"
```

## Step 4 — Apply All Migrations

Apply the complete committed migration history:

```bash
npx prisma migrate deploy
```

All migrations in `prisma/migrations` should be applied successfully.

## Step 5 — Generate Prisma Client

```bash
npx prisma generate
```

## Step 6 — Run the Seed

```bash
npx prisma db seed
```

## Step 7 — Verify Migration Status

```bash
npx prisma migrate status
```

Expected result:

```text
Database schema is up to date!
```

## Step 8 — Validate the Schema

```bash
npx prisma validate
```

Expected result:

```text
The schema at prisma/schema.prisma is valid
```

---

# 7. Database Recovery Procedure

The committed migration history and seed script provide the recovery path for reconstructing the local BMS database.

Use this procedure when the local development database is damaged, missing, or needs to be reconstructed from the committed project state.

## Recovery Steps

### 1. Ensure the migration files exist

Verify:

```text
prisma/migrations/
```

contains the complete committed migration history.

### 2. Ensure PostgreSQL is running

```bash
docker start bms-postgres
```

### 3. Drop the damaged database

```bash
docker exec bms-postgres psql -U bms_user -d postgres -c "DROP DATABASE IF EXISTS bms;"
```

### 4. Recreate the database

```bash
docker exec bms-postgres psql -U bms_user -d postgres -c "CREATE DATABASE bms OWNER bms_user;"
```

### 5. Replay the committed migrations

```bash
npx prisma migrate deploy
```

### 6. Recreate the baseline data

```bash
npx prisma db seed
```

### 7. Verify migration status

```bash
npx prisma migrate status
```

The expected result is:

```text
Database schema is up to date!
```

### 8. Validate the Prisma schema

```bash
npx prisma validate
```

### 9. Generate Prisma Client

```bash
npx prisma generate
```

The database is considered successfully recovered when the migrations are up to date, the Prisma schema validates successfully, and the baseline seed completes successfully.

---

# 8. Migration and Recovery Verification

The complete migration and recovery process has been tested against a clean PostgreSQL database.

## Migration Verification

A fresh `bms` database was created and all committed migrations were applied from scratch.

Result:

- 14 migrations found
- 14 migrations successfully applied
- Database schema reported as up to date
- Prisma schema validation passed

## Seed Verification

The seed was executed against the freshly migrated database.

Result:

- `OWNER` role created
- `MANAGER` role created
- `CASHIER` role created
- 17 baseline permissions configured
- OWNER mapped to 17 permissions
- MANAGER mapped to 14 permissions
- CASHIER mapped to 6 permissions

## Recovery Verification

The database was subsequently dropped and recreated again.

The complete recovery sequence was executed:

```bash
npx prisma migrate deploy
npx prisma db seed
npx prisma migrate status
npx prisma validate
```

Result:

- All 14 migrations successfully reapplied
- Seed completed successfully
- Migration status reported the database as up to date
- Prisma schema validation passed
- 13 application tables were present
- RBAC baseline was reproduced correctly

This confirms that a fresh local BMS database can be reconstructed from the committed migration history and seed script.

---

# 9. Backend Build

Build the NestJS backend with:

```bash
npm run build
```

A successful build completes without TypeScript compilation errors.

---

# 10. Development Workflow

A typical local development setup follows this sequence:

```bash
npm install
docker start bms-postgres
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
npm run build
```

Before committing database-related changes, verify:

```bash
npx prisma validate
npx prisma migrate status
npm run build
git diff --check
```

For a completely fresh database, follow the **Clean Database Setup** procedure instead of relying on the existing database state.
