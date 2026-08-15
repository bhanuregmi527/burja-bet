# TypeORM Migrations Guide

## Overview

This service uses TypeORM migrations for database schema management. Migrations are located in `src/migrations/`.

## Migration Scripts

### Generate a new migration (from entities)

```bash
yarn migration:generate src/migrations/MigrationName
```

### Create an empty migration file

```bash
yarn migration:create src/migrations/MigrationName
```

### Run pending migrations

```bash
yarn migration:run
```

### Revert the last migration

```bash
yarn migration:revert
```

### Show migration status

```bash
yarn migration:show
```

## Current Migrations

### 1734177600000-CreateUsersTable

Creates the initial `users` table with:
- `id` (UUID, primary key)
- `wallet_address` (VARCHAR(44), unique)
- `balance_sol` (DECIMAL(18,9))
- `created_at` (TIMESTAMP)

## Running Migrations

### Development

```bash
# Build the project first
yarn build

# Run migrations
yarn migration:run
```

### Production

Ensure your `.env` file has the correct `POSTGRES_URL` or database credentials, then:

```bash
yarn build
yarn migration:run
```

Or set `migrationsRun: true` in `app.module.ts` to automatically run migrations on app startup (not recommended for production).

## Migration Best Practices

1. **Always review generated migrations** before running them
2. **Test migrations** on a development database first
3. **Never edit existing migrations** that have been run in production
4. **Create new migrations** for schema changes instead of modifying old ones
5. **Use transactions** - TypeORM migrations run in transactions by default

## Troubleshooting

### Migration fails with "relation already exists"

This means the table already exists. Either:
- Drop the table manually: `DROP TABLE users CASCADE;`
- Or modify the migration to check if it exists first

### Migration fails with "extension uuid-ossp does not exist"

The migration automatically creates the extension, but if it still fails:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### See migration history

```bash
yarn migration:show
```

This shows which migrations have been run and which are pending.
