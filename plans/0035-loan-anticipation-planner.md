# Long-horizon loan anticipation planner

Depends on 0034. Compare baseline and loan operations using disposable daily
forecasts through the latest original maturity of selected loans. Rank by net
terminal wealth after remaining debt, taxes, liquidity costs and lost yield.
Automatic official-rate assumptions use exactly five years of history, no window
control. Missing coverage cannot yield a safe verdict.

## Progress

- [x] Shared daily safety, funding eligibility and scenario comparison engine.
- [x] Bounded deterministic search over dates, installments and loan combinations.
- [x] Worker UI, daily/monthly results, progress/cancellation and saved scenarios.
- [x] Connected/guest persistence, tests, builds and hook-validated commits.
- [x] Integrate into original main and remove task worktree.

## Invariants

Investment/savings excluded by default; explicit inclusion allowed; explicit
exclusion always wins. Account selection may be all or specific. Explicit viable
redemptions/transfers required, no silent account compensation. Daily account and
consolidated reserve checks, default reserve zero. Same horizon for all scenarios,
including an 80-month contract. Baseline always included. Saved scenarios keep
parameters and dated summaries; reopening recomputes and flags changes. Execution
requires fresh contractual review; never execute automatically.

## Verification

Deficits within a positive month, illiquid funds, exclusions, multiple currencies,
missing data, yield taxes, partial/combined anticipations, stale saved scenarios,
cancellation and deterministic search. Preserve unrelated local changes.

Execution update: API/guest aggregate persistence, operation review, institution forms, worker search and dated saved scenarios implemented. Targeted domain/storage regression tests pass. Final hook, disposable integration, browser verification and integration remain in progress.

Integration update: plans renumbered to 0034/0035 after concurrent 0033 account transfer delivery. Migration follows account-transfer schema; merged contract retains both domains.

Verification update: full finance suite (316 tests before final summary regression), loan persistence integration (2 tests), atomic visitor storage, frontend/backend builds, desktop/mobile contract creation and worker search/save verified. Broad backend integration currently exposes unrelated normalized-refund replay mock failures; required backend unit coverage passed normal hooks. Final merged migration and corrected guest forecast browser rerun in progress.

Final verification: 325 finance unit tests passed; two disposable loan integration tests passed; three complete migration-chain checks passed. Desktop/mobile creation, worker ranking, save/reopen/recalculation and creditor-confirmed execution passed in headed Chromium with external requests blocked. Frontend/backend production bundles and normal hook type/coverage gates passed. Added arrears, future-grace, liquidity, recurring-stop and selected-due-date regressions. Migration remains unapplied to shared databases. Only integration into original branch and worktree removal remain.

Presentation verification: daily account balance inspection, known commitments beyond selected horizon and explicit terminal assets/debt breakdown added. Finance suite now includes 326 regression tests.

Mobile containment update: shared dialog viewport content uses block sizing so nested horizontal tables cannot widen forms; loan disclosures/results preserve minimum widths. Dialog history/scroll regression tests and production build passed.

## Delivery completed

Integrated into original `main` with local commits. Isolated worktree removed through `git worktree remove`; original compose and database-reference edits preserved byte for byte. Finance suite: 326 passing tests. Loan integration: two passing tests. Migration chain: three passing checks. Dialog history/scroll: 15 passing tests. Headed desktop/mobile browser flows passed creation, search, account balances, save/reopen, recalculation and creditor-confirmed execution. Mobile viewport measured 318 px content within 318 px available. Normal commit hooks and affected production builds passed.

Broad backend integration run still reports failures in `normalized-refunds.test.ts` involving injected replay failure and aborted transactions; that broad suite is not reported as passing. Required unit coverage and targeted loan integration passed.

Runtime boundary: existing `zaimu-dev-1` container remains paused. Its schema watcher restarts the container and startup executes `migrate:deploy`; pausing prevented automatic application while integrating files. Resuming/restarting it can apply the pending migration. No shared/remote database migration, push or deployment was executed. Task preview/dev servers were stopped.
