# Background modal actions

## Goal

Close action dialogs after a valid submission. Keep work running, report progress, and let users reopen a failed form with its submitted values from any route. Keep file imports and review finalization visible until their results determine the next step.

## Progress

- [x] Shared operation, recovery, and navigation support.
- [ ] Account, card, debt, recurring, loan, payment, and institution actions. Balance and card adjustments now use the shared flow; remaining forms still pending.
- [ ] Import review item actions and conflict scoped progress.
- [ ] Behavior tests for recovery, history, partial operations, and independent controls.

## Decisions

- Recovery stays in memory for the current identity and browser session. A failure toast offers Reabrir, including after navigation.
- Background operations close the modal immediately after submission; only conflicting record actions remain disabled.
- An API success remains a success if a later cache refresh fails. Cache refresh is retried separately.
- Recurrence creation followed by replay resumes from the saved recurrence ID after partial failure.
- File upload and review finalization remain in their modal until the response is known.
