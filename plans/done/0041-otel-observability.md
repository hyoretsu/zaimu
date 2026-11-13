# OTEL observability

Approved scope: correlated logs, traces and metrics in Zaimu and ts-monorepo, backend function transformation, dependency and durable-event instrumentation, restricted client gateway, local Grafana stack, dashboards, alerting and local validation. No deployment or shared database operations.

## Progress

- [x] Inspect both repositories, preserve original working changes, create isolated worktrees.
- [x] Shared SDK, sanitization, context, function transformation and fixtures.
- [x] API lifecycle, SQL/Redis/HTTP, workers, durable outbox context and compatible migrations.
- [x] Web/Tauri fetch/navigation/error/Web Vitals signals and restricted gateway.
- [x] Compose, storage, sampling, dashboards and alerts.
- [x] Template SDK/application parity and operational documentation implemented.
- [ ] Fresh local integration/E2E, benchmarks, image builds and final live stack verification.
- [ ] Integrate verified commits into original main branches and remove worktrees.

## Evidence

Sanitization fixtures cover redaction, getters, cycles and collection limits. Runtime fixtures cover concurrent context isolation, recursive truncation, stream consumption and cancellation. Transformation fixture covers synchronous/async functions, methods, closures, exceptions, promise identity, untouched generators and inline source maps. Full integration and overhead validation pending.

## Constraints

Original Zaimu working tree has unrelated compose.yaml and SQL migration-reference changes. Original template has unrelated .serena files. Preserve all. Worktrees: /tmp/zaimu-otel and /tmp/ts-monorepo-otel. Both original branches: main.

Shared SDK and AST transformer implemented; generators use passive spans around iteration lifecycle. HTTP, physical SQL, Redis and outgoing fetch have instrumentation. Durable Zaimu context uses an opt-in additive column, with draft SQL prepared. Both repositories have local commits and passing commit hooks at the preceding checkpoint. Collector configuration validates; disposable Grafana, Tempo, Loki and Prometheus run with synthetic telemetry. Trace and logs were queried successfully. Final expanded dashboard/alert coverage, end-to-end dependency/retry/restart validation, overhead evidence and cleanup remain open.

## November 5 recovery

The tmpfs worktrees disappeared. Recovered committed SDK and staged Zaimu changes from Git objects/index. Resumed on current main in persistent worktrees under ~/.local/share/worktrees/{zaimu,ts-monorepo}/otel-resume. Original main checkouts have unrelated edits and remain untouched. Template now uses native Prisma 8; instrumentation targets its physical pg pool and current transactional SQL helpers. Zaimu retains all new scheduled jobs and Bun 1.4.4. New template package exports JS/declarations from out. Stack/dashboard files were reconstructed because untracked tmpfs files were lost. Earlier validation is historical; fresh checks remain pending.

## Current verification

November 5: SDK commit 6497716b and service integration 3708647d passed normal Zaimu hooks. Template concurrency/stream/depth/link/framework-recompilation fixtures passed (5 tests, 13 assertions). All five local observability services are healthy. Real SDK trace e554ca2e36c7b331a8de335153ec3f85 and matching Loki record were queried through Grafana; cache counter is present in Prometheus. Collector internal metrics bind was corrected after discovering a failed scrape. Screenshots are not accepted yet: captures occurred before panels rendered; full visual verification remains pending. Fresh E2E and image/overhead validation remain pending.

Local sampling verification retained 8/100 ordinary production traces and all error/slow/development fixtures. All 26 dashboard PromQL expressions succeeded and all Prometheus targets are up. Structured logger diagnostics retain approved counters, CPU/memory/pool fields and bounded internal operation spans so the existing benchmark parser remains usable; private fields are still removed. Desktop/mobile captures exposed Grafana virtualization in full-page screenshots; fresh viewport captures are being collected. Full E2E was retried after obtaining the missing Valkey image, but contract generation exceeded the local 300-second limit under high host load. It has not passed yet.

Current hook: 56 affected backend tests passed. SDK fixtures: 14 passed; AST fixture exceeded the default 5-second test budget under host load (~7 seconds), so it now has a 30-second explicit timeout while preserving every assertion. SQL spans now report allowlisted contract entity names and row counts only. Template core committed as 39ce172, current main merged in its isolated worktree pending validation; Tauri origins are shared between gateway and CORS.

Six dashboard JSON definitions are structurally equivalent between projects after project-name substitution. Local screenshots were captured and visually inspected at 1440×1000 and 390×844; empty application panels display No data, while Collector panels show real queue/export metrics. The 26 PromQL queries and sampling evidence apply to these shared definitions. Client resource identity now includes namespace and a bounded per-instance UUID; the gateway forwards it only in traces and strips arbitrary attributes. E2E fixtures now use a real loopback HTTP listener. Fresh E2E execution and overhead measurements are still pending.

## November 8 continuation

Current main a11bc7d5 is being merged into the isolated task branch. Worker bootstrap retains SDK-first loading while worker-app preserves the current held-asset quote job. Turbo keeps current shared-source inputs and OTEL environment forwarding. Original main's unrelated staged frontend fields remain untouched.

Worker consumption now owns a linked root covering receipt deduplication, handler, retries, DLQ and existing operational logs. Handled failure outcomes retain business returns while marking the root and worker metrics as errors. Regression checks preserve confirmation/ack ordering and lease behavior. A native nullable outbox migration is being generated from the latest graph head instead of leaving standalone DDL that would cause schema drift.

Fresh SDK run: 16 tests passed including AST/source maps and the new handled-failure assertion; Collector-outage subprocess exceeded its cold-start limit before SDK initialization under host load ~57. Its shutdown-duration assertion remains enforced; fresh complete validation is pending. Compose configuration validates in both projects. Empty metric sums were corrected in observed availability and telemetry-loss alert expressions. The earlier isolated stack no longer exists; prior live query/screenshot evidence is historical.

Native migration `20261108T0626_otel_outbox_context` generated from current main head aa516107... to432e5b...; official export and offline migration check passed. Its only operation adds nullable JSONB metadata; no shared database was accessed. Standalone DDL draft removed. Code is complete and this plan is archived according to repository policy. Validation is ongoing: twelve worker regressions passed (33 assertions), HTTP dependency regression passed (7 assertions); fresh complete hook/E2E, images, benchmark comparison, live stack checks and final integration remain explicitly pending.

## November 9 adaptation

Merged current main a03e1f77 while preserving the new dashboard compute worker build entry, advancing benchmark clock and user time-format schema. Native outbox migration is regenerated after the new SQL head. Public HTTP and durable contexts retain traceparent only: vendor tracestate must never bypass attribute sanitization. The regression fixture passed with all eight context/stream tests (24 assertions). Worker image now includes external PDF package dependencies and linked source maps. Fresh hooks, images, disposable journeys, overhead measurements and integration remain pending.

Native successor `20261109T0344_otel_outbox_context` now follows user-time-format head611bd8a... and emits storage a2f0ff9...; official export/plan passed with exactly one additive nullable JSONB operation. Compute transport regressions passed ten tests (21 assertions); a real Bun Worker preserved the incoming trace ID and first message across SDK bootstrap. SDK suite passed19tests/67assertions. Further validation remains pending.
