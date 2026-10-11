# Tax definitions, IR and IOF by contribution

Approved: 2026-10-11. Daily net compounding, FIFO withdrawals, calendar-day contribution age. Global versioned tax catalog managed by ADMIN; searchable multiple selection plus optional individual fixed withholding. IOF applies before IR; fixed withholding last. Existing historical fixed rates remain unchanged. External authorization initially permitted only promoting existing hyoretsu@gmail.com. Separate authorization allowed adding the role column and USER/ADMIN constraint; tax migrations remain unapplied.

## Progress
- [x] Shared tax catalog, contribution ledger and tests
- [x] Database contract, migration artifact and protected administration API
- [x] Historical worker, balances, forecasts and offline integration
- [x] Multiple tax selection and administration screen
- [x] Verification, documentation, local commits and admin promotion

Preserve pre-existing credit-card, dashboard and database-ref changes. Partial implementation from planning must be adapted before completion.

Admin promotion completed on external database with separately authorized role-only schema addition; no tax migration applied.

Validation complete:
- 84 focused arithmetic, historical, forecast and mobile route tests passed.
- Normal commit hooks passed formatting, lint, SQL/finance/backend/frontend type checks and backend unit coverage.
- Frontend Vite build and backend API/worker build passed.
- Local browser verification passed mobile admin rendering, discard, simulated promotion, multiple IR/IOF/fixed selection, searchable special option and saved account payload. APIs were intercepted; no external writes during browser tests.
- Work completed and committed on isolated local branch feat/tax-definitions to avoid concurrent calendar/history edits in primary workspace.

Migration artifact: packages/sql/scripts/tax-definitions.sql. Apply separately through explicitly authorized migration workflow. No push or deploy.
