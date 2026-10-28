# Loan contracts and shared financial indicators

Approved scope: mandatory institution for new loans; preserve legacy lender text.
Shared fixed/CDI/SELIC/IPCA/TR rules for loans and account yields. Versioned
PRICE/SAC/manual contracts, grace, costs, partial payments, reversals,
renegotiation/portability and explicit disbursement links. Shared simulation for
selected installments, principal amortization, payoff and recurring advances.
Connected and guest use the same domain calculations. No remote mutations.

## Progress

- [x] Shared indicators and contract/simulation engine with regression tests.
      Core commit: 87a8f339. Thirteen targeted tests and hook type checks passed.
- [x] Persistence, versioned operations, API contracts and guest synchronization.
- [x] Institution association, forms, schedules and payment/simulation UI.
- [x] Generated SDK, integration tests, build and hook-validated commits.
- [ ] Integrate into original main and remove task worktree.

## Verification

PRICE/SAC/manual, zero rates, rounding, short months, negative indices, grace,
partial payments, reversals, stale simulations, institution ownership, account
movements and preservation of historical payments. Update business rules with
implemented behavior. Prepare migrations locally; never deploy them remotely.

Execution update: API/guest aggregate persistence, operation review, institution forms, worker search and dated saved scenarios implemented. Targeted domain/storage regression tests pass. Final hook, disposable integration, browser verification and integration remain in progress.

Integration update: plans renumbered to 0034/0035 after concurrent 0033 account transfer delivery. Migration follows account-transfer schema; merged contract retains both domains.

Verification update: full finance suite (316 tests before final summary regression), loan persistence integration (2 tests), atomic visitor storage, frontend/backend builds, desktop/mobile contract creation and worker search/save verified. Broad backend integration currently exposes unrelated normalized-refund replay mock failures; required backend unit coverage passed normal hooks. Final merged migration and corrected guest forecast browser rerun in progress.

Final verification: 325 finance unit tests passed; two disposable loan integration tests passed; three complete migration-chain checks passed. Desktop/mobile creation, worker ranking, save/reopen/recalculation and creditor-confirmed execution passed in headed Chromium with external requests blocked. Frontend/backend production bundles and normal hook type/coverage gates passed. Added arrears, future-grace, liquidity, recurring-stop and selected-due-date regressions. Migration remains unapplied to shared databases. Only integration into original branch and worktree removal remain.

Presentation verification: daily account balance inspection, known commitments beyond selected horizon and explicit terminal assets/debt breakdown added. Finance suite now includes 326 regression tests.
