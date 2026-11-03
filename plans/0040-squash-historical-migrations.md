# Squash the historical migration graph into a native baseline

Follows `plans/0039-prisma8-latest-rc.md`, which integrated the Prisma 8 migration but kept the 113 early-RC migrations as an executable history. That history forces every environment to install and run a second, pinned toolchain (`packages/sql/compatibility/early-rc`, `bun run setup:historical-sql`), and every new historical migration on `main` requires hand regeneration of the native baseline and five pinned hashes (done three times in one day).

## Objective

A database created from nothing is built by one native baseline migration with the latest toolchain. The 113 historical migrations become a frozen, unexecuted archive. New migrations are native successors of the baseline. Databases still behind keep a transition path until each has been upgraded, after which the old toolchain is removed.

## Urgency and ordering

The squash must land before further migrations reach `main`. Reasons: a new migration in `packages/sql/migrations/app` changes the historical head, so the pins and the baseline have to be regenerated again; and the baseline must be squashed at exactly one contract hash, because after it exists, later contract changes can only be native successors chained to that hash.

Branches that currently carry their own migration or contract changes, measured against each merge base (2026-11-03): `fix/synced-purchase-value`, `fix/synced-purchase-rules`, `fix/remove-account-notice`, `fix/purchase-field-alignment`, `fix/pdf-password-optional`, `fix/json-closing-date`, `fix/card-profile-settings`, `fix/approve-unmatched`, `fix/refund-review`, `fix/institution-edit-permissions`, `fix/import-iof-link`, `feat/yield-per-account-type`, `feat/invoice-payment-preference`, `feat/institution-defaults`, `feat/batch-import-files`, `feat/account-ownership-transfers`, `fix/refund-sql-limit`, `task-required-validation`, `fix/unique-institution-options` (others exist; recompute with `git diff --name-only $(git merge-base main <branch>) <branch> -- packages/sql`). Most are hundreds of commits behind `main`, so their migration files are probably stale copies and not new work; check each before treating it as a pending migration. Any that does add a migration must be re-planned as a native successor after the squash.

## Facts established before writing this plan

- `packages/sql/prisma.config.ts` already points `migration plan` at `migrations-native`, so new migrations are generated as native successors of the baseline today. Successor planning is covered by `packages/sql/tests/prisma8-native-successors.e2e.test.ts` (it needs an explicit `--from` hash).
- The native baseline (`migrations-native/app/*_native_format_baseline`, 409 operations) is generated from the contract only. It creates tables, indexes, foreign keys, enums and the `public` schema. It does not contain the custom objects or seed data of the historical graph. It is never executed on a database that already has a marker.
- `scripts/migrate.ts` today replays the historical graph for any database whose marker is absent or inside the historical graph, verifies the schema against the baseline contract, and signs the native marker. A brand-new database therefore also replays all 113 migrations.
- Preliminary scan of the 113 migrations: 10 operations create functions, views, triggers or extensions (`extension.pgcrypto`, `function.cuid2`, `transaction-search-indexes`, `creditLedger.integrity`, `recurrence.backfill`, `applicationUpgrade.audit`, `recurrence.removeLegacy`, `finance.removeLegacy` and others); at least 16 operations write data; 7 migrations provide persisted invariants (`taxDefinitions.initialCatalog.v1`, `universalInstitutions.legacyPreserved.v1`, `legacyYieldCalendar.frozen.v1`, `monthlyBudget.values.v1`, `monthlyBudget.uncategorizedValues.v1`, `creditCard.nubankCycleDefaults.v1`, `creditPurchases.allowExcessRefunds.v1`). This scan is not authoritative; step 1 produces the real list.
- The latest migration API offers `rawSql`, `dataTransform` and `createExtension` (found in `@prisma/orm-target-postgres` typings). Whether they cover everything above is verified in step 2, not assumed.
- Latent defect in the history: `enforce_credit_purchase_integrity()` was written with `SELECT 1 FROM "Subscription"` (migrations `20260928T1340` and `20261001T0542`), and the table `Subscription` no longer exists after `20261001T0542`. The function body is not validated when created, so databases migrated that far carry a broken function. It stays hidden until a pending migration changes a credit-card row, then fails with `relation "Subscription" does not exist` (reproduced on a local copy of the `zaimu` database, marker `489fa825`, 36 migrations pending, 78 ledger entries). Replacing `"Subscription"` with `"Recurrence"` in the function repaired it, and the real `migrate` then completed with the seeded row preserved. Whether a freshly replayed database also ends with the broken function is not yet checked (step 1).

## Design

1. **Baseline at the current contract.** Squash at the contract hash that is current when step 4 starts (today `7c4f89de…`). The baseline migration's `to` hash must not change after any successor exists.
2. **Hand-extended baseline.** The generated baseline gains, in the same migration, the custom objects and seed data a fresh replay produces. After that edit it is source code: it must never be regenerated by `migration plan` again. Record that in `docs/engineering-rules.md` and in a comment at the top of the file.
3. **Equivalence is proven, not assumed.** A test builds one database by full historical replay and one by the baseline, then compares the normalized `pg_dump --schema-only` output (tables, columns, defaults, constraints, indexes, enums, functions, views, triggers, extensions, sequences) and the full contents of every table, plus the seven invariants. Known intended differences, such as the repaired function body, are listed explicitly in the test and nowhere else.
4. **Transition for lagging databases.** In phase A, `scripts/migrate.ts` branches on the marker:
    - no marker: execute the native baseline (no old toolchain);
    - marker at the native baseline hash or a native successor: the existing native path;
    - marker inside the historical graph and below head: repair the integrity function if it is still stale, replay the remaining historical migrations with the old toolchain as today, verify, then sign;
    - unknown marker: refuse before any mutation, as today.
      In phase B the third branch is replaced by a clear refusal naming the release that must be deployed first, and `compatibility/early-rc` is deleted.
5. **Historical directory frozen.** `packages/sql/migrations/app` and `snapshots` stay in the repository as an archive, still immutable. A test fails if a file is added to them, which protects the cut-off from stale branches.

## Steps

- [ ] 0. Freeze. Agree with everyone who can merge that no migration is merged to `packages/sql/migrations/app` until step 7 lands, and reject any such change in review. Optionally enforce it with the test from design point 5, added first.
- [x] 1. Inventory (read-only). Script that replays the historical graph on a disposable database and diffs it against the generated baseline: lists every function, view, trigger, extension and seeded row the baseline lacks, and reports whether the replayed `enforce_credit_purchase_integrity()` still mentions `"Subscription"`. Commit the script and its output summary in this plan.
- [x] 2. Choose the mechanism per object (`rawSql`, `dataTransform`, `createExtension` or plain operations) and prove each with a disposable database; unsupported objects are recorded here with their reason.
- [x] 3. Write the extension of the baseline migration, with the corrected function body, and the header comment forbidding regeneration.
- [x] 4. Equivalence test (design point 3) in `packages/sql/tests`, registered in `scripts/testing/test-manifest.json`. It must fail when any single object is removed from the baseline (mutation check).
- [ ] 5. `scripts/migrate.ts` branches from design point 4, phase A. Tests: empty database, database at native head, database at a historical midpoint including the seeded credit purchase that triggers the stale function, unknown marker.
- [ ] 6. Fresh-database paths use the baseline: `tests/prepare-schema.ts`, the disposable runner, `prisma8-fresh-history.e2e.test.ts`, `compose.yaml` (dev still needs `setup:historical-sql` only for lagging databases) and `backend/Dockerfile`. Keep the replay suites that exercise individual historical migrations as archive tests, and mark them so their intent is clear.
- [ ] 7. Docs and integration. Update `docs/engineering-rules.md` (how to add a migration: native successor only; baseline is hand-maintained; archive frozen), update plan 0039, run all four suites and the pre-merge `check-types` and `build`, then integrate.
- [ ] 8. Phase B, after every environment is past historical head 113 (see questions): replace the lagging-database branch by a refusal, delete `packages/sql/compatibility/early-rc`, remove `setup:historical-sql` from `package.json`, `compose.yaml`, `backend/Dockerfile` and the docs.

## Verification

- Equivalence test (step 4) passes, and fails under mutation.
- SQL integration, SQL E2E, backend integration, backend E2E (known failing assertion unchanged), workspace `check-types` and `build`, with exit codes read from the runner and test names confirmed in the logs.
- A copy of the `zaimu` database schema (marker `489fa825`) with one synthetic credit purchase upgrades to head through the phase A path. Use a throwaway local Postgres; never run the new path against a shared database before the owner approves it.

## Risks

- A custom object that the historical graph created and nobody remembers (a trigger on a table that later moved). The equivalence test is the only defence; it compares everything `pg_dump` reports, not a hand-written list.
- A seed or default value that only exists as a side effect of a backfill. The full table-content comparison covers it.
- The baseline's migration hash changes when its operations change, and `prisma_contract.ledger` stores that hash. A database that executed the old, schema-only baseline would then disagree. None exists outside disposable test databases (existing databases adopt the marker by signing, without executing it), but confirm with `SELECT migration_name FROM prisma_contract.ledger WHERE migration_name LIKE '%native_format_baseline%'` on every database before step 3 lands.
- `main` keeps moving; each merge of `main` into the work branch must re-run the checklist in plan 0039 (pins, baseline hash, table count) until the squash is integrated.
- Regenerating the baseline by habit after the squash would silently drop the hand-written parts. Mitigated by the header comment, the mutation-checked equivalence test and the engineering rule.

## Questions that decide phase B (answer before step 8)

1. Which databases exist and at which marker? Known: the development database was signed at the native baseline during plan 0039; `zaimu` (host `postgres.hyoretsu.com`, database `zaimu`) is at `489fa825`, 36 migrations behind head, and needs the function repair and one run of the phase A path. Unknown: production, staging, any other environment or developer database.
2. How are `refs` handled for native migrations? `docs/engineering-rules.md` requires `packages/sql/migrations/app/refs/db.json` to follow every historical migration; the native directory has no `refs` yet. Decide the rule before others add successors.
3. Are the archive tests (`credit-ledger-cutover`, `remove-recurrence-legacy` and similar, which import individual historical migrations) still worth running after the cut-off, or should they be retired together with the old toolchain in phase B?

## Progress

Plan written 2026-11-03 after reproducing and repairing the lagging-database failure on a local copy.

- Step 1 done (`packages/sql/scripts/inventory-baseline-gap.ts <replayedUrl> <baselineUrl>`). Result of a full replay of the 113 migrations (head `0da3dd5c…`, 14s) against an empty database, counting only user-defined objects:
    - extensions the baseline lacks: `pgcrypto`, `pg_trgm`, `unaccent` (the extensions also add about 70 extension-owned functions, which come with `CREATE EXTENSION`);
    - own functions: `cuid2`, `credit_cycle_date`, `enforce_credit_purchase_integrity`, `enforce_credit_refund_policy`, `markDeletedRecurrencePurchase`, `markDeletedRecurrenceTransaction`, `normalize_search`, `trackUpgradeRecurrence`, `zaimu_ownership_guard`, `zaimu_record_owner`;
    - 51 triggers (46 `zaimu_ownership_guard`, 4 credit integrity, `FinancialInstitution_refund_policy`, 3 recurrence delete triggers);
    - views `CreditConsumption`, `CreditEntry`, `CreditRefundEffect`;
    - sequence `prisma_contract.ledger_id_seq`;
    - seeded rows: `taxDefinition` 2, `taxDefinitionVersion` 2 (plus 2 `OutboxEvent` rows, to be checked in step 2 whether they are seed data or side effects).
    - A freshly replayed database does **not** carry the broken `"Subscription"` reference in `enforce_credit_purchase_integrity()`. Only databases migrated to the middle of the history carry it.
    - The generated baseline does not even run on an empty database: it fails with `function cuid2() does not exist`, so `cuid2` and `pgcrypto` must come first in the extended baseline.
- Steps 2 and 3 done. Mechanism: every custom object is a `rawSql` operation in `migrations-native/app/*_native_format_baseline/custom-objects.ts` (extensions and `cuid2` right after `createSchema`; the other functions, 19 CHECK constraints and 2 trigram indexes the contract cannot express, the three views in dependency order, 51 triggers, then the two seeds as sibling `.sql` files). `createExtension` and `dataTransform` were not needed: `rawSql` with `operationClass: "data"` covers the seeds, as the historical seed migration already did. No object is unsupported. The generated `CREATE FUNCTION` bodies come from the replayed database, so `enforce_credit_purchase_integrity()` has the corrected `"Recurrence"` body. Verified on disposable Postgres 17: the extended baseline applies to an empty database (499 operations) and its catalog (columns, defaults, constraints, indexes, enums) matches the full replay, except that Postgres deparses six equivalent CHECK expressions with different parentheses and casts (the step 4 test normalizes this). New baseline migration hash `migration.json` changed because the operations changed; the contract `to` hash is unchanged.
- Step 4 done: `packages/sql/tests/baseline-equivalence.e2e.test.ts` (registered in `sql:e2e`). It builds one database by full historical replay and one by the baseline, then compares columns, enums, extensions, function bodies, indexes, non-CHECK constraints, normalized CHECK constraints, sequences, triggers, views, every table's contents (minus the random ids and timestamps of the two `OutboxEvent` rows) and the marker invariants. 10 of 10 pass, including 9 mutation checks (drop a check, extension, function, index, trigger, view, the tax seed, the outbox seed or the invariants) that each make the comparison fail. Ran against a scratch Postgres 17 with the runner's fixture environment set by hand, not through `scripts/test-runner.ts`. The baseline also had to provide the seven marker invariants (`custom-objects.ts`), otherwise successors could not require them.
- Steps 5 to 9 not started.
