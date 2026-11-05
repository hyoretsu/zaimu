# OTEL observability

Approved scope: correlated logs, traces and metrics in Zaimu and ts-monorepo, backend function transformation, dependency and durable-event instrumentation, restricted client gateway, local Grafana stack, dashboards, alerting and local validation. No deployment or shared database operations.

## Progress

- [x] Inspect both repositories, preserve original working changes, create isolated worktrees.
- [x] Shared SDK, sanitization, context, function transformation and fixtures.
- [x] API lifecycle, SQL/Redis/HTTP, workers, durable outbox context and compatible migrations.
- [x] Web/Tauri fetch/navigation/error/Web Vitals signals and restricted gateway.
- [ ] Compose, storage, sampling, dashboards and alerts.
- [ ] Template parity, local integration/E2E, benchmarks, image builds and operational documentation.
- [ ] Integrate verified commits into original main branches and remove worktrees.

## Evidence

Sanitization fixtures cover redaction, getters, cycles and collection limits. Runtime fixtures cover concurrent context isolation, recursive truncation, stream consumption and cancellation. Transformation fixture covers synchronous/async functions, methods, closures, exceptions, promise identity, untouched generators and inline source maps. Full integration and overhead validation pending.

## Constraints

Original Zaimu working tree has unrelated compose.yaml and SQL migration-reference changes. Original template has unrelated .serena files. Preserve all. Worktrees: /tmp/zaimu-otel and /tmp/ts-monorepo-otel. Both original branches: main.

Shared SDK and AST transformer implemented; generators use passive spans around iteration lifecycle. HTTP, physical SQL, Redis and outgoing fetch have instrumentation. Durable Zaimu context uses an opt-in additive column, with draft SQL prepared. Both repositories have local commits and passing commit hooks at the preceding checkpoint. Collector configuration validates; disposable Grafana, Tempo, Loki and Prometheus run with synthetic telemetry. Trace and logs were queried successfully. Final expanded dashboard/alert coverage, end-to-end dependency/retry/restart validation, overhead evidence and cleanup remain open.

## November 5 recovery

The tmpfs worktrees disappeared. Recovered committed SDK and staged Zaimu changes from Git objects/index. Resumed on current main in persistent worktrees under ~/.local/share/worktrees/{zaimu,ts-monorepo}/otel-resume. Original main checkouts have unrelated edits and remain untouched. Template now uses native Prisma 8; instrumentation targets its physical pg pool and current transactional SQL helpers. Zaimu retains all new scheduled jobs and Bun 1.4.4. New template package exports JS/declarations from out. Stack/dashboard files were reconstructed because untracked tmpfs files were lost. Earlier validation is historical; fresh checks remain pending.
