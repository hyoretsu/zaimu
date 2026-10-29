# Institution defaults and yield profiles

Country supplies default currency, accounts accept every supported currency, admin configures profiles and currency-independent yield policies directly. Preserve historical currency-scoped policies and approval/audit flows.

- [x] Update persistence, DTOs and shared policy resolution; preserve historical scope.
- [x] Simplify institution editor and account defaults; add profile creation and scoped yield editor.
- [x] Regenerate SDK, cover regressions and verify mobile/desktop behavior.
- [x] Commit changes, integrate into original main and remove task worktree.

Local-only work. Never run migrations against configured external databases.

Progress: offline migration prepared; OpenAPI exported and SDK regenerated. 329 finance tests, 11 disposable integration tests, 15 frontend selection/cache tests and offline currency defaults passed. Full commit hooks passed. Backend and frontend builds passed both in isolation and after integration. Desktop/mobile screenshots inspected for the yield editor, profile submodal, institution editor, loading/error recovery and account form. Browser assertions confirmed default profile selection, validation, currency-free policy submission, nested profile submission isolation and manual JPY selection preserved after switching BR to US. Main integration completed with hooks enabled; unrelated local changes preserved and task worktree removed. Migration remains unapplied. Nested profile submissions stop propagation to prevent saving the parent policy.
