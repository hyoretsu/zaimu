# Global action batching

Approved: accumulate repeatable actions with 300 ms debounce, 1 s maximum wait,
50 operations and 1 MiB envelopes. Preserve order, independent transactions,
per-action results, authentication, cache/outbox and explicit retries only.

## Progress

- [x] Backend batch endpoint, explicit route policy and regression tests.
- [x] Shared frontend queue, session/cancellation safeguards and list integration.
- [x] Consolidated import completion feedback and refresh.
- [x] Repository/template rules, SDK regeneration and local verification.
- [x] Hook-validated implementation commit.
- [x] Integration into original branches.

No remote writes or database migrations. Preserve pre-existing changes.

Validation: 35 targeted frontend tests and six batch controller tests pass.
Backend build passes. Frontend build passes with `--configLoader runner` because
shared dependency directories contain a root-owned `.vite-temp` cache. Hook-driven
type checks, backend unit coverage, lint and formatting pass for the final implementation. SDK export/generation runs through the existing graph.
Template rule integrated into its original `main` as `89cfdc4`; template worktree removed.
Zaimu implementation integrated into original `main` as `858bf938`. Equivalent
changes verified with a reverse patch check and comparison of affected files.
Task worktree cleanup follows final verification.
