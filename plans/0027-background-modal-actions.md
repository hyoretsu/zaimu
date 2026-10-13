# Background modal actions

## Goal

Close action dialogs after a valid submission. Keep work running, report progress, and let users reopen a failed form with its submitted values from any route. Keep file imports and review finalization visible until their results determine the next step.

## Progress

- [x] Shared operation, recovery, and navigation support.
- [x] Account, card, debt, recurring, loan, payment, and institution actions.
- [x] Import review item actions and conflict scoped progress.
- [x] Behavior tests for recovery, history, partial operations, and independent controls.

Verified partial account defaults save: retry rereads current state and skips the already completed statement update. Verified recurrence replay retry uses the created ID without creating another recurrence.

## Decisions

- Recovery stays in memory for the current identity and browser session. A failure toast offers Reabrir, including after navigation.
- Background operations close the modal immediately after submission; only conflicting record actions remain disabled.
- An API success remains a success if a later cache refresh fails. Cache refresh is retried separately.
- Recurrence creation followed by replay resumes from the saved recurrence ID after partial failure.
- File upload and review finalization remain in their modal until the response is known.

Institution profile changes, profile/merge proposals, and yield save/delete now close immediately and recover submitted fields. Directed operation tests pass for duplicate clicks, independent records, recovery after navigation, identity changes, and cache refresh retries. Existing history tests pass for nested dialogs and explicit close.

Debt creation, origin editing, and person editing now use recoverable background actions. Card statement dates, refinancing, refunds and adjustment deletion have been migrated with recovery of the original card and statement month. Import review item edits, reconciliation, approval, ignore and deletion use isolated pending records; upload and finalization remain visible. Browser recovery and scoped build verified.

Browser verification passed for immediate child dismissal, surviving parent modal, isolated controls, browser Back, recovery after navigation with original fields, and Escape closing only the recovered child. Thirteen unit behavior tests passed, including overlapping record batches and refresh-only retries. Final frontend build passed.

Account statement and balance adjustment deletions now close on confirmation, recover their original listing, and block only the affected record.

Debt invitation association and decline now run in background; failed association restores its selected person.

Suggested card payments preserve their attempt ID and fields across recovery. Loan history confirmation closes immediately; payments, advances and history updates serialize within the same loan while other loans remain available.

## Final validation

- 13 unit behavior tests passed (52 assertions): duplicate submission, independent and overlapping scopes, route recovery, identity change, refresh-only retry, modal history and partial saves.
- 2 local browser scenarios passed: immediate child close, parent survival, independent controls, browser Back, recovery after navigation with original fields, Escape and resubmission. Browser used isolated fixtures; no external requests or mutations.
- Frontend production build passed (`bun run build` in `frontend`). Commit hooks passed formatting, lint and affected type checks.
- Temporary browser fixture removed from workspace; unrelated edits and staged changes preserved. API and database unchanged.
