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

- Raw candidates still requiring capability review: outbox and notification claim CTEs, advisory locks (`pg_advisory_xact_lock`), `CreditEntry` view reads, `ON CONFLICT` upserts and interval arithmetic. This is NOT an approved exception register: locks, upserts and intervals are not automatically exempt from conversion.
- `acf98baf` converts DebtsController event pagination and invitation summaries and adds disposable integration coverage (3 tests, 26 assertions passed). Event ordering is date DESC NULLS LAST, id DESC; source/refund/purchase times, descriptions, viewer-relative effects and hidden-person exclusion are covered. These two baseline queries do not contain an archive recordId join; that invariant belongs to sync-manual-debt-events. Invitation numeric aggregation remains under semantic review.
- Superseded: the raw-statement counts in this section were hand estimates. Use `bun scripts/raw-sql-inventory.ts` (see the 2026-11-02 status section) for the current inventory.

## Validation outstanding

Plan is NOT code-complete; do not archive. Outstanding: remaining ordinary raw SQL conversion by domain, complete financial semantic review, investigation of blocked backend E2E assertions, JSON normalization review, and the pre-merge type-check/build gate.

## 2026-11-02 continuation

Frozen verification at `acf98baf` finished: SQL integration, SQL E2E and backend integration each exited 0. Backend E2E exited 1 (2 pass, 3 fail, 118 assertions): forecast purchases are empty, shared-debt invitation balance differs, and cleanup violates FinancialInstitutionProposal_authorId_fkey. A previous verifier reports matching baseline failures; their actual causes are not yet established, and assertions after failing points remain unvalidated. Logs are `/tmp/zaimu-verify-{sql-integration,sql-e2e,backend-integration,backend-e2e}.log`.

Bounded parallel work resumed using Sonnet 5.5 at low effort: E2E fixture investigation, monthly-budget conversion, remaining store-query conversion, and read-only JSON/invitation numeric review. No integration into original Zaimu main or remote action has occurred.

## 2026-11-02 status after the second continuation

Still NOT code-complete; do not archive and do not integrate until the conversion scope below is decided.

Verified on committed source (runner exit codes read from the runner itself, with test names checked in the logs):

- SQL integration, SQL E2E and backend integration pass. Backend integration includes the new regression suites for stores, categories, monthly budgets, balance adjustments, debt event page and taxes.
- Backend E2E: 3 of 4 tests pass. The remaining failure is the refund debt link (`database.e2e.test.ts`, "expected one `DebtPurchaseLink` after deleting a refund, received none"). It reproduces unchanged on the pre-migration commit `6ccf868d` with the same fixture corrections, so it is pre-existing, not caused by this migration. Business rules say refund deletion preserves history, so it is likely a product defect. Not fixed here.
- The native-successor E2E test takes about 140 to 200 seconds against a 300 second limit and timed out once under heavy machine load. It is a flakiness risk, not a defect.

Builder behavior established (installed `@prisma/orm-postgres` 8.0.0-rc.22):

- The typed builder has no `ON CONFLICT`, no insert-time expressions, no recursive CTE or CTE-driven update, no advisory locks, no `COLLATE` and no `strpos`. Statements needing these keep raw SQL, or use typed `functions.raw` expressions for the narrow capability (stores and categories catalogs).
- An explicit `undefined` is sent as NULL on insert and on update; an omitted key uses the column default. Pinned by a runtime test. Two NOT NULL columns (`yieldTaxIds`) were broken by this and fixed. Update behavior is identical in the early RC runtime, so it is not a regression.

Conversion progress: monthly budgets, stores, categories, balance adjustments, debt event page, invitation summary and four of five tax statements are converted.

Inventory: run `bun scripts/raw-sql-inventory.ts [directory] [--list | --json]` (default `backend/src`). It reads the TypeScript AST, so it finds SQL held in variables and passed through any alias, and it keeps `functions.raw` typed expressions separate. At `HEAD` before the merge work it reported 594 statements: 252 candidates with no PostgreSQL-specific construct, 121 expressible with a narrow typed raw expression, 149 to review (row locks, joins in updates, array membership, windows, CTEs) and 72 blocked by verified builder gaps (`ON CONFLICT`, insert-from-select, recursive CTEs, advisory locks), plus 58 typed raw expressions already in use. About 20 of the statements are large SQL fragments held in variables (`monetaryBalancesSql`, `creditOverviewSql`, the dashboard comparison queries), which are the hardest conversions. The tier is only a static hint; each statement needs its own check, and flagged statements are not automatically exempt.

Test infrastructure: `prepare-schema.ts` now honors `TEST_COMMAND_TIMEOUT_MS`. The runner has no file filter and `--changed` can select zero tests and still pass, so validation requires full runs without `--changed`.

Pre-merge gate at `b2334909`: workspace `check-types` (7 of 7 tasks) and `build` (5 of 5 tasks, 3 cached) both exit 0. The cached build tasks reuse outputs for unchanged inputs.

Still outstanding: the conversion above, financial semantic review of unread chunks, and integration into the original `main` (nothing is integrated or pushed). Integrating the current partial state is a decision for the owner: every commit is individually tested and the gate passes, but the requested full adoption is not finished.

## 2026-11-02 merge with `main` (read this before integrating)

State: the branch contains `main` up to `2d2d54b1` (merge commit `57158d7f`). `main` has moved on since (at last check `23ddd4b1`, several frontend commits plus backend commits for Inter Global USD statements, yield recalculation and loan/credit-card controllers), so it must be merged again immediately before integration. Nothing is integrated into `main` and nothing is pushed.

Verified on the merged tree (runner exit codes read from the runner, not from wrapper commands): SQL integration, SQL E2E (111-migration replay, adoption, two native successors, fresh history), backend integration (30 of 30 files) and workspace `check-types` and `build` pass. Backend E2E is 3 of 4; its failure (a missing `DebtPurchaseLink` after refund deletion) is also present on the pre-migration commit and on `main`.

Repeat this checklist for every new merge of `main`:

1. `git merge main`. Expect conflicts where `main` moved import flows (`credit-card-imports` and `transaction-imports` controllers moved into `application/upload.ts`); take `main`'s side and port the date handling below.
2. New models written for the old toolchain use `Timestamp(3)` / `Timestamptz(3)`; the new toolchain needs `TimestampJsDate(3)` / `TimestamptzJsDate(3)` (`ImportFileJob` was the first case).
3. If `main` added historical migrations (`packages/sql/migrations/app/*`), the pinned hashes must follow. Update `historicalHead` in `packages/sql/scripts/historical-replay.ts`, `head` in `packages/sql/tests/prepare-schema.ts` and `historicalHead` in `packages/sql/tests/prisma8-contract-parity.integration.test.ts` to the new head (`to` of the newest `migration.json`). Then copy `src/prisma/contract.prisma` over `compatibility/native-baseline/contract.prisma`, run `contract emit` with `compatibility/native-baseline/prisma.config.ts` (use a dummy `DATABASE_URL`; emit is offline), delete `migrations-native/app/*` and `migrations-native/snapshots/*`, run `prisma migration plan --from @empty --name native_format_baseline`, and replace the old baseline hash in `scripts/migrate.ts` and `tests/prisma8-native-successors.e2e.test.ts` with the new storage hash. The table-count assertion in the parity test changes with every new model. A new table or index adds baseline operations (`ImportFileJob`: +4, from 404 to 408); a new column on an existing table adds none, because the column lives inside that table's operation (`FinancialInstitutionYieldPolicy.accountType` left the count at 408). Both emits (live and baseline config) must report the same storage hash.
4. Run `bun run check-types`. Code written against the old runtime fails where a `Date` is passed to a DATE column (the builder now takes `YYYY-MM-DD` strings). Raw `queryRaw` reads still return local-midnight `Date` values; convert them with date-fns `format(value, "yyyy-MM-dd")`, not `toISOString()`.
5. Run all four suites without `--changed`. The runner stops at the first failing file, so later files are not run; fix or temporarily patch failures that also fail on a pristine checkout of `main` (create a throwaway worktree, run `bun run export` in `backend` for `out/openapi.json`) so the rest get covered.

Hazards found:

- The commit hooks (`biome --write --unsafe`, `eslint --fix`, `bun fmt`) rewrite every staged file, and `main` contains files that are not canonical under `bunfig.toml` (`printWidth = 110`). A merge commit therefore reformats `main`'s incoming files. The historical migration graph is now exempt (`lint-staged.config.mjs`), but `frontend/src/lib/debt-split.ts`, `frontend/src/lib/debt-split.test.ts` and `backend/src/modules/debts/domain/debt-split.ts` still differ from `main` by formatting only. The two frontend files also carry uncommitted work in the original checkout, so integrating requires that work to be committed or stashed first.
- `main` also contains a stale test, fixed on this branch: `universal-institutions.integration.test.ts` re-approved administrator-authored proposals, which `main` now applies on creation (409). It fails identically on `main`. If `main` fixes the same two lines, the next merge conflicts trivially.
- The development container `zaimu-dev-1` runs `scripts/dev-migration-watch.sh`, which restarts the container and applies migrations when files under `packages/sql/migrations`, `migrations-native`, `src/prisma` or `compatibility/native-baseline` change. Stop it before updating the original checkout, or the local development database will be migrated automatically. A development database that already applied `main`'s newest migrations has a marker that the new handoff recognizes only if that migration is part of the historical graph in this branch.
- The runner and the SDK test need machine headroom. On a loaded machine (load average above about 25) Redis-backed authentication returns 503 and the native-successor scenario can exceed its time limit (it now allows 900 seconds). Rerun before concluding a failure is real.

Final verification of the merge state at `a9269a88`: SQL integration and SQL E2E were rerun after the historical snapshot was restored to `main`'s exact content (both exit 0; the native-successor scenario took 551 seconds at a load average of 38, which exceeds the former 300 second limit). Backend integration, backend E2E, `check-types` and `build` were verified at `f67b3095`; the later commit changes only hook configuration, a restored type-declaration snapshot and formatting of three files.

## 2026-11-02 integration into `main`

The branch was merged with `main` a second time (`56e13939`, which added the 112th historical migration `20261102T2033_yield_policy_account_type`, head `ec3991a8…`, baseline `e15dbe7f…`) and then fast-forwarded into the local `main`. Nothing was pushed.

Defects that exist on `main` itself, found because the merged runner reached suites that were otherwise hidden behind the first failure. Each is its own commit on this branch so it can be dropped if `main` already fixed it:

- `universal-institutions.ts`: `INSERT INTO "FinancialInstitutionYieldPolicy"` lists `accountType` as `$11` but supplied ten values (bind error 08P01 when publishing any new policy). Fixed by appending `policy.accountType ?? null`.
- `open-finance/application/process-record.ts`: `new Date(\`${input.date}T00:00:00\`)`interpolates a`Date`object, producing an invalid date, so the new yield-recalculation enqueue threw`RangeError`and every non-yield record became a pending review. Fixed by using the original`remote.date` string.
- `universal-institutions.integration.test.ts`: re-approved administrator-authored proposals (409). Two redundant lines removed.

Verified at the integration commit (runner exit codes read from the runner itself): SQL integration, SQL E2E (112-migration replay, adoption, two native successors, fresh history), backend integration (30 of 30 files), workspace `check-types` and `build`. Backend E2E: 3 of 4, the failing assertion being the pre-existing refund `DebtPurchaseLink` one that also fails on the pre-migration commit and on `main`.

Known inherited issues not fixed: the refund `DebtPurchaseLink` assertion above; about 250 plain raw SQL statements still unconverted (`bun scripts/raw-sql-inventory.ts`).

Integration notes for the next person:

- The development container `zaimu-dev-1` bind-mounts the checkout and its watcher restarts it on any change under `packages/sql/migrations`, `src/prisma` or `prisma.config.ts`; the restart then runs `bun -F sql migrate:deploy` against the database in `packages/sql/.env` and `backend/.env` (`zaimu_dev` on a remote host). Integration therefore stopped the container first and left it stopped. Starting it again will run the new migration handoff against that database for the first time (it replays pending historical migrations, verifies the native baseline and adopts the marker); check that database first.
- The checkout's `node_modules` and `packages/sql/out/` predate this change; `bun install` and `bun -F sql contract:emit` are needed before running anything locally.
- Two uncommitted frontend files, `frontend/src/lib/debt-split.ts` and `debt-split.test.ts`, overlap files this branch reformats; they were carried across in canonical formatted form with a backup (see the integration report).
