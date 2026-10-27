# Loan contracts and shared financial indicators

Approved scope: mandatory institution for new loans; preserve legacy lender text.
Shared fixed/CDI/SELIC/IPCA/TR rules for loans and account yields. Versioned
PRICE/SAC/manual contracts, grace, costs, partial payments, reversals,
renegotiation/portability and explicit disbursement links. Shared simulation for
selected installments, principal amortization, payoff and recurring advances.
Connected and guest use the same domain calculations. No remote mutations.

## Progress

- [ ] Shared indicators and contract/simulation engine with regression tests.
- [ ] Persistence, versioned operations, API contracts and guest synchronization.
- [ ] Institution association, forms, schedules and payment/simulation UI.
- [ ] Generated SDK, integration tests, build and hook-validated commits.
- [ ] Integrate into original main and remove task worktree.

## Verification

PRICE/SAC/manual, zero rates, rounding, short months, negative indices, grace,
partial payments, reversals, stale simulations, institution ownership, account
movements and preservation of historical payments. Update business rules with
implemented behavior. Prepare migrations locally; never deploy them remotely.
