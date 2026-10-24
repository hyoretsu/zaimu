# Separate imported refund review from approval

Approved scope: saving a refund source or reconstructed original keeps the item pending. Explicit individual or bulk approval applies financial effects. Legacy refund review outside imports keeps its current behavior.

## Steps

- [x] Persist validated refund review drafts and expose typed save/read contracts; prepare local migration.
- [x] Share financial approval between individual and batch actions, retaining blocked items and resolving pending sources.
- [x] Update import UI to save/discard review and approve separately; regenerate SDK.
- [x] Verify regression cases and commit with hooks.
- [x] Prepare verified commit for integration into original main and task worktree removal.

Original branch: main. Task worktree: /home/hyoretsu/Projects/@personal/zaimu/.worktrees/refund-review. Preserve existing compose.yaml and migration-reference changes in original worktree. No remote mutation or deployment.

Validation completed: backend/frontend/SQL type-checks, backend/frontend builds, formatting and backend unit coverage passed through normal commit hooks. Nine frontend tests, reproducible OpenAPI export and 35 shared parser regressions passed. All seven new financial integration scenarios passed, including concurrent approval. The filtered runner reports skipped pre-existing tests by design; its completeness guard rejects filtered suites. An earlier full normalized suite hit timeouts in two pre-existing bulk/identity tests under machine load. Migration applied successfully only to the runner's disposable local database; repository database reference unchanged.

Delivery: implementation committed with local configured author/committer and Codex co-author. Verified commit is ready for local integration and cleanup; no remote operations.
