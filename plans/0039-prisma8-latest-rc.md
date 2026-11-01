# Full Prisma 8 latest RC adoption

Approved source: `/home/hyoretsu/.claude/plans/rosy-chasing-flask.md`.

## Boundaries

Work only in this task worktree; parent handles integration. Preserve immutable migration history, all 90 models, physical names and financial/API contracts. Only disposable local databases may be used. No push, deploy, signing, remote database action or original-main edits.

## Execution

- [ ] Verify independently versioned latest RC packages and disposable runtime probe.
- [ ] Upgrade SQL runtime, contract generation/config/migrator preserving graph invariants, transaction connection affinity, codecs, auth and metrics.
- [ ] Convert ordinary application SQL domain by domain to ORM/builder, retaining documented PostgreSQL-specific exceptions.
- [ ] Validate disposable schema/model parity, financial/concurrency/auth behavior and affected build/type gates.
- [ ] Inventory remaining SQL exceptions; archive this plan when code-complete.

## Progress

Registry verified on 2026-11-01: `prisma@8.0.0-rc.29`, `@prisma/orm-postgres@8.0.0-rc.22`. Existing worktree starts clean at `6ccf868d`. Template implementation is owned by a separate agent. Historical migrations and refs are not editing targets.

## Validation outstanding

Runtime probe, package installation/generation, domain conversion and disposable integration checks are pending. This plan must not be archived until implementation is code-complete.
