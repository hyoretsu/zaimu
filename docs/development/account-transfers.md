# Account ownership transfers

Transfers move Zaimu registrations and history, through a reviewed invitation between existing users with verified email addresses. They do not initiate bank payments. Invitations have no expiry. Accounts remain usable until acceptance. A changed preview must be reviewed again.

## Local implementation

- `backend/src/modules/account-transfers` owns invitations, previews and the atomic ownership change. PostgreSQL ownership guards coordinate financial writes with the transfer barrier and reject stale cross-owner references.
- Selected account IDs are fixed at invitation creation, including hidden accounts. Institution selection happens in the shared frontend form. Accounts created later remain outside the invitation.
- IDs are preserved where ownership moves as a whole. Cross-boundary transfers/payments become independent one-sided records. Protected historical records retain their financial classification; deletion affects only the current owner's copy. Detached reward credits preserve date, amount, accrual policy and existing reversals, and appear in the account statement.
- Debt obligations and loans stay with their existing parties. Compatible schedules move without their former debt split rules. Cross-boundary schedules pause, and occurrence reservations remain occupied. Open Finance credentials stay private; bindings are detached and the recipient reconnects independently.
- The shared catalogue remains unchanged. Per-account profile context preserves transferred rules without replacing the recipient's institution preferences.
- `/account-transfers` lists invitations. `transfer` identifies a URL-backed review dialog. Links route through authentication and never accept automatically.

## Push configuration

All settings below belong to the backend environment. Never commit private keys or service-account JSON. Missing configuration leaves the in-app banner operational and delivery pending for a later configured attempt. SMTP uses the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` configuration.

| Provider | Configuration                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web Push | `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` (a `mailto:` contact or HTTPS origin)                                             |
| Android  | `FCM_SERVICE_ACCOUNT_JSON` for backend OAuth; public client settings `FCM_ANDROID_APP_ID`, `FCM_ANDROID_API_KEY`, `FCM_PROJECT_ID`, `FCM_SENDER_ID` |
| iOS      | `APNS_PRIVATE_KEY` (PKCS#8 ES256), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`, `APNS_ENVIRONMENT` (`production` or `development`)                  |
| Links    | `PUBLIC_WEB_URL` must point to the web application                                                                                                  |

Web Push requires HTTPS outside localhost and browser/PWA notification support. Browser delivery uses `frontend/public/push-sw.js`; payloads contain navigation hints, without balances or account names. Register from the transfer screen through **Ativar push**. Registration, token renewal and logout honor the current session.

The local Tauri plugin implements FCM on Android and APNs on iOS. Its native dependencies match the repository's Android SDK 34/Kotlin baseline. Android stores public Firebase client settings for process startup and handles foreground and background notification taps. iOS preserves existing app delegate callbacks while observing APNs token registration. The custom iOS template adds `aps-environment`, with development/debug and production/release configuration. Enable Push Notifications for the bundle ID and use a provisioning profile with that entitlement. This is a provider prerequisite, not permission to modify an Apple account automatically.

The iOS template is based on the [Tauri CLI 2.11.4 template](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-cli/templates/mobile/ios/project.yml). Keep it synchronized when upgrading Tauri. Recreate generated mobile projects through the existing local native build workflow after plugin changes.

Notification deliveries are persisted alongside the invitation and processed by the existing worker, independently of the financial transaction. The outbox carries cross-user cache events. Each channel/device has a distinct delivery record; cancelled or superseded events are skipped before dispatch. Temporary delivery failures retry with bounded exponential backoff. Invalid device destinations are disabled. SMTP and push transports can provide at-least-once delivery after an uncertain provider acknowledgement; stable push tags collapse duplicate notifications.

## Verification

Use `bun run scripts/test-runner.ts backend integration`, the normal commit hooks, and builds scoped to backend/frontend. The transfer suite uses disposable loopback services and injected notification transports. Provider calls must remain mocked in local tests. Browser checks cover desktop/mobile review, selection and navigation. Rust checks validate the plugin interface and application integration. Real APNs signing and iOS compilation require macOS/Xcode; Android device and real-provider delivery require the configured native environment. No test authorizes remote notifications, migrations or deployment.
