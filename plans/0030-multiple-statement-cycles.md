# Multiple statement cycles in one month

Approved: identify invoices by stable ID and full dates, retaining month/year labels.

## Steps
- [x] Shared cycle history, transition rules and installment allocation.
- [x] Persist history; expose institution defaults and card transition editing.
- [x] Import reconciliation by identity/full dates with explicit correction selection.
- [x] Disambiguate invoice labels; preserve both cycles in monthly windows.
- [x] Regression tests, affected builds, hook validation and local integration.

## Evidence
Nubank anonymized example: closings 2024-09-01, 2024-10-01, 2024-10-17,
2024-11-17; dues 2024-09-09, 2024-10-08, 2024-10-24, 2024-11-25.
Installments 1/12 and 2/12 occur in October; 3/12 in November.
Do not commit uploaded personal PDFs. No external mutations or migrations.

## Validation progress
- 286 regression tests passed after incorporating concurrent main changes.
- Guest IndexedDB reload retains both October invoices and calendar history.
- Shared cycle, monthly/cycle installment, import identity/order and UI labels covered.
- Both application builds passed; commit hooks passed scoped types, lint and backend coverage.
- OpenAPI exported and SDK regenerated through existing scripts (840 ignored artifacts).
- Migration authored and serialized offline; no database migration executed.
- Local integration and worktree removal follow this commit; no remote actions.
