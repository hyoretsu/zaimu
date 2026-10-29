# Prisma 8 RC query builder migration

## Objective

Replace Prisma 7 and direct Kysely data access with Prisma 8 RC's PostgreSQL SQL query builder without changing the database or HTTP contracts.

## Steps

- [x] Adopt the Prisma 8 contract, runtime, dependency set, and migration graph in `packages/sql`.
- [x] Rewrite backend queries and remove direct Prisma 7/Kysely artifacts.
- [x] Add repeatable database integration coverage and update workspace tooling.
- [x] Validate fresh and legacy database paths; inspect the configured external database and stop before signing on schema mismatch.

## Decisions

- One branch performs the full cutover; no dual runtime remains.
- PostgreSQL physical names and current controller behavior remain unchanged.
- Better Auth uses a custom adapter over Prisma 8 ORM collections. Patched dependency metadata removes its unused Kysely packages.
- The configured external database receives only the Prisma 8 contract marker. Schema/data migrations remain forbidden.

## Progress

User authorized Better Auth 1.7 account identity support. Migration `20260823T1522_migration`
adds and safely backfills `account.issuer`, then creates its composite unique index. Fresh and
legacy disposable databases verify against contract hash
`7e10bdadb0733ef1799bba084f3d689d6b4e7b6763223924f604ebb2dc78915e`.

Prisma 8 custom Better Auth adapter passes signup, login, protected ownership, CRUD, balance
arithmetic/reversal, dashboard aggregation, and empty sync E2E coverage with Kysely absent.
Configured external database lacks the application schema, so verification mismatch stopped the
handoff before `db sign` or `ref set`; no external mutation occurred.
