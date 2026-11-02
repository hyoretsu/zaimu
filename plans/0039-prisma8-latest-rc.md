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

## Current blockers and partial inventory

Latest RC CLI originally failed before database access with `CLI.UNEXPECTED`: `Cannot use 'in' operator to search for 'kind' in typeChoice`. Root cause: CLI rc29 pins toolchain rc21, whose descriptor guards do not understand runtime rc22 type choices. Explicit root overrides pin toolchain and framework rc22; standard real 90-model emission now succeeds without package source patches or downgrades. Explicit timestamp JS-Date aliases, named time precision and native literal defaults preserve storage/DTO intent. Lowercase tax table mappings preserve authoritative historical names. Domain conversions are paused after bounded slices until one end-to-end runtime slice can be validated.

Preliminary remaining inventory (different counting methods; not a combined total): accounts/account-transfers retain 202 SQL-template sites; cards/imports retain 96 ordinary and 31 PG-feature candidate literals; open-finance remains unchanged with 82 raw calls (73 ordinary, 7 locks, 2 whole-row JSON snapshots); financial-history/yield-calendar retain 45 ordinary and 15 PG-feature candidate statements plus reference-rates/dashboard composed queries. Debts retains four raw statements (ledger aggregate, two row locks, conditional atomic upsert). Locks and lateral joins are supported by rc22, so those are not accepted permanent exceptions merely by classification. Full adoption is not complete.

Historical migration files use the old `postgresStatic({ contractJson })` signature whereas rc22 exposes `{ contract }`; latest also rejects old snapshot `nativeType` representation. History is untouched. A standalone pinned historical-only replay dependency package and temporary execution view successfully replayed 54 pending migrations, requiring all seven graph invariants, on a runner-created disposable database (three E2E assertions passed). Latest schema verification then correctly refused three JSON defaults accidentally decoded as arrays/objects; native source now preserves scalar JSON strings exactly and the regression comparison no longer normalizes them away. Re-verification passed. Existing-upgrade replay applies 54 pending migrations (three E2E tests pass); fresh-empty replay applies all 110 migrations (fresh seed/view assertions pass). Both latest schema verifications pass. Normalized physical parity integration passes, preserving scalar JSON defaults. Mixed ORM/builder/raw nested rollback connection-affinity integration passes with timestamp/null and builder update-returning checks. Latest builder syntax requires explicit `.build()` and `(fields, ops)` predicates; domain conversion owners are now selectively resumed to update old and new callers. Guarded format adoption/mismatch-refusal regression is running; no production target has been touched. Nine tracked obsolete Prisma 7 generated artifacts have no discovered active consumers, but remain untouched pending supported removal through generated-file safeguards.

Frozen disposable SQL E2E validation completed successfully: existing migration scenarios (3 tests, 70 assertions), fresh exact-wrapper unknown-marker/schema-mismatch/repeat scenarios (1 test, 11 assertions), and official two-successor continuation (1 test, 7 assertions). The successor scenario verifies genuine historical replay followed by one wrapper invocation through baseline adoption and both successors, intermediate native markers, preserved user data, and absence of native baseline CREATE in the migration ledger. Native baseline source and emitted artifacts are reproducible with the pinned official CLI. Historical migration diff remains empty.

The scoped infrastructure commit was attempted through hooks and refused by backend dependent type checking (182 errors in 34 files); SQL/scripts checks passed. Existing bounded domain owners are repairing latest builder, numeric and date boundaries without API widening or cast suppression. No implementation commit exists yet. A concrete card/import inventory still lists 78 ordinary literals, 32 PostgreSQL/bulk candidates requiring capability review and 9 absent-contract CreditEntry-view queries; no blanket raw exception is accepted.

## Execution results (continuation)

Commits after the infrastructure commit: `34381ec0` (sql json decode + auth adapter), `e6aa5633` (accounts/yield), `20bff6a2` (transfers/transactions), `20c7d47a` (cards/imports), `9479eb01` (debts/loans/remaining), `66d88f7a` (notifications). All passed the repository hooks.

- Currency default cache test: root cause was the runtime sending `set_config(DateStyle/lc_monetary)` once per physical connection plus a one-time `verifyMarker` probe. The test now warms the runtime (`defaultCurrency("currency-warmup")`) in `beforeAll`; the expectation (1 physical query) is unchanged. Justification: those queries are per-connection/per-process setup, not per-read cost.
- Real regression found and fixed by executing the suite: `CreditCardImportItem.metadataMissing` is a historical `json` column whose migration default is the JSON string `"[]"`. The previous runtime parsed twice; the new one parses once and returned the string `"[]"`, so every default-metadata item looked incomplete and bulk approval silently approved nothing. `packages/sql/src/index.ts` now unwraps strings that parse to arrays/objects for `pg/json`/`pg/jsonb` projected columns (historical migrations untouched).
- Transactions API: date-only columns serialize again as UTC-midnight instants in create/update/detail responses (`withDateInstants`).
- Better Auth adapter: ORM collection `skip/take` renamed to `offset/limit`.

Disposable `bun run scripts/test-runner.ts backend integration`: passes (exit 0) after the fixes above. Disposable `backend e2e`: `backend/tests/database.e2e.test.ts` FAILS, identically to the pre-migration baseline. Evidence: a throwaway worktree of 6ccf868d run through the same runner failed at the same three points (account creation 400 `Selecione o pais da conta` because the test user has no preferredCountry; forecast statement purchases at line 591; debt invitation preview at line 1323; plus a user-delete FK cleanup error). The test user fixture now sets `preferredCountry: "BR"`; remaining failures are pre-existing and hide later assertions, so e2e coverage beyond line 591/1323 is NOT validated. A prior uncommitted diff of this test file was discarded by mistake during this session (git checkout) and could not be recovered; the test was re-edited minimally (preferredCountry fixture, `recurrenceOccurrenceDate` is now a string).

## Raw SQL kept on purpose / deferred

- Kept raw (PG capability): outbox `FOR UPDATE SKIP LOCKED` CTE and notification delivery claim CTE, advisory locks (`pg_advisory_xact_lock`), `CreditEntry` view reads, `ON CONFLICT` upserts, interval arithmetic on `now()`.
- DebtsController event page and invitation summary remain original raw SQL (COALESCE(source_transaction.time, refund.time, purchase.time), per-event CASE descriptions, viewer-relative effect, hiddenAt IS NULL, stable name,id ordering, recordId join). Not converted: a faithful builder translation was not completed.
- ~499 raw call sites remain across the backend (largest: account-transfers/move-financial-history 43, open-finance sync/process-record/configuration, credit-card-imports/import-service 24, sync/SyncController 21, transaction-imports controller 14, monthly-budgets 13, accounts/institutions controllers). Not converted in this pass.

## Validation outstanding

Plan is NOT code-complete; do not archive. Outstanding: remaining raw SQL conversion by domain, faithful conversion (or documented retention) of the two debt queries, full-review of financial query semantic drift (a read-only reviewer was run; see parent report), the pre-existing e2e failures, SQL-package suites after the json decode change, and the pre-merge type-check/build gate.
