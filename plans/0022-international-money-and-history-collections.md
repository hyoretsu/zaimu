# International money and recoverable financial history

Approved 2026-10-07. Implementation stays local: prepare migrations, never apply them or push/deploy.

## Execution

- [ ] Monetary model and ISO precision: explicit native/original money, institution/card defaults, all monetary domains, legacy BRL preservation.
- [ ] Shared PostgreSQL collection/unit progress, transactional outbox, RabbitMQ workers, fenced leases, retries, recovery and global provider limits.
- [ ] Integrate ten-year CDI/Selic bootstrap/daily/repair coverage and atomic yield recalculation publication.
- [ ] Demand-driven 365-day currency histories, official CDN/Cloudflare fallback, partial weighted estimates and public visitor reads.
- [ ] Currency-aware account/card/debt/loan/recurrence/import/payment engines and native/consolidated reporting.
- [ ] Persisted optional currency preference, seven-day IP location cache, settings, inheritance and travel suggestion confirmation.
- [ ] Visitor/sync upgrades, UI/native formatting, collection progress, tests, scoped builds and offline migration validation.

Update this checklist and commit it with every completed step. Resume by reading this file.

## Accepted behavior

All monetary amounts have a currency; percentages and points do not. Points' monetary equivalents do. Native books never mix currencies. Accounts/cards display native money; reports convert to the effective preference. Defaults follow explicit choice, linked card/account/institution, then preference. Existing books with history, balance or commitments cannot change currency. Institution/preference changes only affect new defaults and reporting. Only national ISO 4217 currencies present in currency-api are selectable. ISO precision applies to rounding, inputs, installments and refunds, including JPY/KWD. Legacy values remain BRL; previous foreign source/conversions are preserved.

Transfers/payments preserve native amounts on both sides, with daily conversion suggested and actual amount editable. Debts aggregate per currency before consolidation; fixed splits identify their currency. Concrete card purchases retain purchase-date conversion. Future estimates never rewrite concrete bookings.

Preference is nullable and persisted per authenticated owner, locally for visitors. Null resolves IP country, explicit device region, then USD. Use a client IP-only adapter initially backed by https://ipapi.co/json/, without app credentials. Detect even with explicit preference; cache country/currency/time per device for seven days, refresh on expired launch/foreground, deduplicate, and never reset edited form fields. Country mapping uses CLDR intersected with supported catalog.

Homepage banner compares detected currency with explicit preference. Its button opens confirm/cancel modal; confirmation directly changes preference and refreshes reports. Dismissal is persisted per owner and country/preference/detected-currency combination, not reset on same-country cache refresh. Automatic preference follows detection directly.

## Collections

PostgreSQL collection and globally deduplicated work-unit records are authoritative. Track domain/series/window/key/state/attempts/next-attempt/lease/timestamps/error. Link requests to unique work; reuse overlapping requests and persisted coverage. Create requests/work/outbox atomically. Commit downloaded data, confirmed coverage, work completion and downstream commands atomically before ACK. Progress measures completed coverage, not stored row count, and never resets for a fixed request.

States: pending, running, completed, completed-with-gaps, failed. Units distinguish data success, confirmed no publication and failure. Lease 90 seconds, heartbeat 20 seconds, renew receipt too; owner/token fences prevent stale workers committing. Recovery resends only incomplete demand after expired leases/restarts. Backoff/jitter respects Retry-After; exhausted work remains visible and reaches DLQ. Retry only failed work. Currency history uses separate queue from point lookups, six globally concurrent downloads. Preserve production interest queue names/routing contracts. All Redis/broker resources use service namespace.

FX forecast window is 365 days preceding reference date; fetched only on forecast demand, both involved bases, full daily snapshots. Central provider tries jsDelivr then Cloudflare same date/endpoint on HTTP/timeout/invalid payload. Historical dates are exact; latest snapshots store returned publication date. Weighted forecast mean uses 2^(-ageDays/90), normalizes available dates and reports partial coverage. Coherent factors relative to report currency connect native forecasts. Current positions use latest published rate with date; historical flows/positions use event/position date. Missing FX never becomes zero or mixed-currency sums.

Interest window remains ten calendar years ending yesterday, stable annual intervals/current tail, rolling daily fetches and repairs. Reuse previously proven coverage events. Successful intervals without official publication count as coverage, never artificial zeros. Arithmetic daily CDI/Selic averages remain unavailable until full coverage. Changed rates and necessary yield recalculation outbox commands share transaction.

Public visitor requests use same backend queues, cache snapshots/results/progress in owner-scoped IndexedDB for offline use, never download hundreds of days in browser. FX partial estimate/progress does not block unrelated dashboard sections; interest shows progress until complete average. Reads do not initiate collection. Request operations return an ID immediately; windows/series are validated; retries are idempotent. Responses expose currency/method/window/coverage/state. Existing interest average fields remain compatible.

## Verification

Meaningful unit/integration coverage: crash before/after commit and ACK; outbox loss; redelivery; expired leases; concurrent workers; overlapping demand; retry/DLQ; recovery; monotonic coverage; no-publication days; existing interest proofs; idempotent recalculations; FX fallback/partial/complete weighting; ISO precision; transfers; splits; statements; loans; imports; sync/visitor; preference/location/cache/fallback/banner confirmation/mobile.

Use normal commit hooks for formatting/lint/types/backend unit coverage; scoped builds and offline migration integrity. Local user authors/commits; Codex co-author trailer. Existing uncommitted `packages/sql/migrations/app/refs/db.json` belongs to user and stays untouched.

## Completed milestones

- Shared currency provider now validates exact dates, uses official fallback, preserves Retry-After, and rounds converted values using ISO precision. Unit tests and commit hooks passed.
- Monetary schema and durable history tables generated; offline migration preserves native/source distinctions and imports proven interest coverage. Migration artifact checks passed; migration remains unapplied. Engine and application integration remain pending.
