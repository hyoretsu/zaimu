# Long-horizon loan anticipation planner

Depends on 0033. Compare baseline and loan operations using disposable daily
forecasts through the latest original maturity of selected loans. Rank by net
terminal wealth after remaining debt, taxes, liquidity costs and lost yield.
Automatic official-rate assumptions use exactly five years of history, no window
control. Missing coverage cannot yield a safe verdict.

## Progress

- [x] Shared daily safety, funding eligibility and scenario comparison engine.
- [x] Bounded deterministic search over dates, installments and loan combinations.
- [x] Worker UI, daily/monthly results, progress/cancellation and saved scenarios.
- [ ] Connected/guest persistence, tests, builds and hook-validated commits.
- [ ] Integrate into original main and remove task worktree.

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
