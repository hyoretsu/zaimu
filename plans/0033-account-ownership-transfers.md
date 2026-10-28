# Account ownership transfers

Approved design: move selected accounts and their financial history between existing verified Zaimu users through a non-expiring invitation. Preserve each side of separated financial movements; obligations remain with the sender. Compatible recurrences move. Notify through banner, email, Web Push, Android FCM and iOS APNs.

Original branch: main. Task branch: feat/account-ownership-transfers.

## Progress

- [x] Database, ownership guards and detached movement persistence.
- [x] Preview, invitation lifecycle and atomic financial transfer.
- [x] Notification delivery and native/web push registration.
- [x] Shared transfer UI, global banner and deep links.
- [x] Financial, authorization and concurrency tests; scoped local builds.
- [ ] Integrate verified commit into main and remove task worktree.

## Validation

Use disposable local services only. Never send real notifications or mutate remote services. Preserve unrelated working changes. Commit through normal hooks, integrate into main and remove task worktree.

## Evidence

- 13 transfer integration cases passed against disposable PostgreSQL, including invoice replay, loan/debt preservation, used category hierarchies, pending imports, private institutions, stale writes, Open Finance detachment, rollback and acceptance/cancellation serialization.
- 34 frontend navigation/deep-link tests passed. Desktop/mobile browser review passed at 1366 px and 390 px, without horizontal overflow.
- Backend/frontend builds and application/standalone-plugin Rust checks passed. Normal commit hooks passed type checks, backend unit coverage and lint/format validation.
- Full backend integration remains non-green: existing normalized-refund assertions require rejection above purchase total, while current refund implementation permits excess refunds. Reproduced the first failure without the new ownership guards (two R$70 refunds both succeed against a R$100 purchase). Original refund tests and implementation remain unchanged.
- iOS/Kotlin platform compilation and real provider/device delivery remain unverified; require platform SDKs and provider credentials. No real notifications, remote migrations, pushes or deployments performed.
