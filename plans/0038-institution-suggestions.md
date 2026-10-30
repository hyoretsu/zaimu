# Institution suggestion hub

Users suggest institutions and rules to admins from an action button on the accounts and credit-card screens; a modal chooses the suggestion type. Extends the existing `FinancialInstitutionProposal` review flow instead of adding a parallel module.

- [x] Backend: open PROFILE and POLICY proposals to any user, add the `CARD_RULES` kind (applied only on approval) and cap pending proposals per author.
- [x] Frontend: extract the yield policy editor; add `SuggestionHubDialog` with one form per type and the "Sugerir à equipe" action on accounts and credit cards; label `CARD_RULES` in the admin queue.
- [x] Document the rules in `docs/business-rules.md`.
- [x] Desktop/mobile screenshots of the modal (see Progress).
- [ ] Integrate into `main` and remove the task worktree.

No migration: `kind` is a `VarChar(24)` and `payload` is Json. Local-only work.

Progress: backend type-check passed and the 16 `universal-institutions` integration tests pass, including the new `CARD_RULES` one. Frontend type-check passes. The integration suite stops at `creditCards/tests/normalized-refunds.test.ts` (timeouts and extra rows) and at `currencies/tests/currency-default-cache.integration.test.ts`; neither touches this change, but their baseline on `main` was not checked.

Screenshots (desktop 1280 and mobile 390, API mocked) inspected for the type menu and the new-institution, new-profile, card-rules and merge forms. Not visually validated: the yield-policy form inside the hub, the "Sugerir à equipe" button on the real accounts and credit-card pages (no seeded backend), and the admin queue row for `CARD_RULES`.
