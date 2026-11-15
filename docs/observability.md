# OpenTelemetry

Backend telemetry is enabled automatically when `OTEL_EXPORTER_OTLP_ENDPOINT` is set for API and worker; leave it unset to disable. Web/Tauri builds enable it by default in production; set `VITE_OTEL_ENABLED=false` (or `true` in development) before building to override. The SDK starts before application modules. Bun preload and build use the same AST transform; React functions are excluded.

## Local stack

```sh
export GRAFANA_ADMIN_PASSWORD='choose-a-local-password'
# Public configuration only: non-root containers must read these bind mounts.
chmod 644 observability/*.yaml observability/grafana/dashboards/*.json \
  observability/grafana/provisioning/*/*.yaml
docker compose -f observability/compose.yaml up -d --build
```

Grafana binds localhost:3300 and the Collector localhost:4318. Override host ports with `GRAFANA_HOST_PORT` and `OTEL_HOST_PORT`. Storage services use an internal network. Applications in Docker must join that network and use `http://collector:4318`. No existing application Compose or shared database is changed. Pinned upstream images gain a static Go HTTP health probe. Persistent volumes retain data across restarts.

## Configuration

| Variable                    | Default            | Purpose                                                   |
| --------------------------- | ------------------ | --------------------------------------------------------- |
| OTEL_EXPORTER_OTLP_ENDPOINT | unset (disabled)   | Private Collector URL; setting it enables the backend SDK |
| OTEL_CLIENT_VERSIONS        | NODE_ENV           | Up to ten allowed client releases; others become unknown  |
| OTEL_LOG_LEVEL              | info               | Minimum severity                                          |
| OTEL_CAPTURE_SUMMARIES      | false              | Bounded structural summaries                              |
| OTEL_FUNCTION_MAX_DEPTH     | 32                 | Nested operation limit, maximum 32                        |
| OTEL_FUNCTION_MAX_SPANS     | 1000               | Span budget, maximum 1000                                 |
| VITE_OTEL_ENABLED           | true in production | Web/native webview SDK override                           |
| TRACE_RETENTION             | 168h               | Tempo retention                                           |
| LOG_RETENTION               | 336h               | Loki retention                                            |
| METRICS_RETENTION           | 30d                | Prometheus retention                                      |

Vite values are public. No Collector credential belongs in a bundle. Clients export a restricted JSON trace subset to `/telemetry/traces`: allowed origins, 64 KiB, 64 spans, 30 batches/minute per direct peer, bounded bucket map and read timeout. Proxy trust requires operator review before relying on individual peer limits. Arbitrary URLs, errors, attributes, logs and event bodies are discarded. Client metrics are recorded before trace sampling. Authentication and SDK requests resolve the instrumented fetch transport. Tauri uses its actual webview fetch and a separate service identity.

Service names are derived in code, not configured: `zaimu-api` and `zaimu-worker` from `initialize(service, "zaimu")` in the entrypoints (exported as `OTEL_SERVICE_NAME`), and `zaimu-web` or `zaimu-tauri` from the browser SDK, which the gateway validates before forwarding. `service.namespace` is `zaimu`. `service.version` and `deployment.environment.name` come from `NODE_ENV` (backend) and the Vite mode (clients); there is no separate release variable.

## Capture and lifecycle

While telemetry is exporting, `console.*` records go to the Collector and are not echoed locally; only errors are still written to the console. Without a Collector endpoint (outside production) structured records are printed as one readable line, e.g. `01:15:15.177 INFO  zaimu-worker worker_job queue=cache-invalidation outcome=ok durationMs=95.5`.

No SQL parameters, raw results, Redis keys, user IDs, credentials, financial amounts, documents or file content are exported. Summaries retain approved technical fields only; other values become types, counts and structure. Unknown object fields remain opaque; only fixed technical property descriptors are inspected. Arrays retain counts and at most twenty slots. Limits: depth 4, 20 collection items, 512 characters and 8 KiB. Getters, toJSON, streams and iterators are not consumed. Exception text and stacks are omitted rather than exporting potentially sensitive content.

The transformer covers own backend functions/methods and excludes generated files, dependencies, tests, administrative scripts and telemetry internals. Use `/* @otel-ignore */` directly before a function for an exclusion. Classes keep constructors intact. Sync functions returning promises retain identity and unhandled-rejection behavior; their function spans end on synchronous return. Async function spans observe the body settlement. Generators use passive lifecycle spans from first iteration to exhaustion, return or exception; context is never held active across yields. Unclosed iterators cannot produce completed spans. Source maps compose transform and bundle mappings.

HTTP spans cover response-stream consumption, cancellation, disconnects and errors. W3C trace context crosses HTTP and optional outbox metadata. Delayed publication and consumption use new traces with links; request spans do not await jobs. Existing performance counters remain their single source and are not incremented by the OTEL layer.

Queues are bounded to 2048 records, export requests have a 3-second timeout and export deadlines 4 seconds. Shutdown flush is bounded to 5 seconds. Collector outages may drop telemetry but must not fail business requests. Runtime memory, CPU and event-loop metrics are included; GC is reported only where the runtime supports its PerformanceObserver entry type. Continuous profiling is excluded.

## Optional outbox column

`packages/sql/migrations/app/20261114T2247_otel_outbox_context` prepares the additive nullable JSONB column in the native migration graph, with its generated contract snapshot. The outbox always writes `telemetryContext`, so apply the migration through the normal migration workflow before deploying this code; do not apply separate DDL outside the graph. Payloads, routing keys and old events remain valid. No shared migration has been executed by this task.

## Production sampling and cost

SDKs export all spans. Collector retains development/test traces, errors, operations above two seconds and 10% of the rest. Metrics and logs have separate unsampled pipelines. Tail sampling buffers up to 10,000 traces for 30 seconds; it consumes memory and export bandwidth before discarding traces. Memory limiter: 512 MiB plus 128 MiB spike; container: 768 MiB. Queues/refusal/export failures are visible in pipeline metrics. Review long-running traces beyond the decision window and capacity before production enablement.

Six dashboards provide environment/release comparison, requests/functions, dependencies, workers, clients and runtime/pipeline metrics. Prometheus evaluates alerts locally; no external contacts are configured. Log/trace links and metric exemplars are provisioned. Administrative PostgreSQL/Redis/RabbitMQ exporters remain optional and require separately supplied read-only endpoints; application instrumentation works independently.

## Validation

Work is still in progress. On November 5 the shared SDK and service commits passed normal hooks. A real SDK trace, correlated Loki record and application Prometheus counter were queried successfully in the isolated local stack. All five services became healthy; the Collector internal metrics endpoint was explicitly bound on its internal network. Earlier fixtures and synthetic stack checks remain historical evidence for the previous checkout. Current integration/E2E, image builds, dashboard queries, sampling and representative application overhead require fresh local verification. No deployment, push or shared database operation is authorized by these checks.

## Adding modules and dependencies

Own TypeScript functions under `backend/src` are transformed automatically in development and release builds. Keep administrative scripts, generated files and telemetry infrastructure in the excluded paths. Use `@otel-ignore` for lifecycle loops that never represent a completed operation. React components are not transformed. Restart a development process after changing SDK configuration.

Wrap a new dependency at its physical execution boundary with `startDependency`; finish exactly once on success or failure, including callback APIs. Do not add a second SQL counting layer around repositories. New operation names and metric attributes must come from a finite application-defined set; keep record IDs, paths, query parameters and user data out of metric labels. For durable work, capture W3C context in optional event metadata inside the transaction, then use `linkedOperation` after publication/consumption. Never retain an HTTP span until a delayed job completes.

Production operators configure allowed web origins and public API URL, pin backend/client release identifiers, apply the reviewed additive outbox migration before deploying. Route only the restricted application gateway publicly; keep Collector credentials and storage ports private. Attach containerized API/worker services to the Compose project's `telemetry` network and set the internal Collector address. Back up persistent volumes before changing retention. Collector refusal, queue saturation and failed export counters require capacity review before enabling detailed capture at production volume.

The disabled/enabled comparison measures the instrumentation switch in the same build. SDK imports and transformed call sites can still contribute startup/bundle cost with the switch disabled; this is not an unmodified-application baseline. Benchmark under comparable host load and record cold startup separately from steady request latency, CPU and RSS.

## Metric exemplars

The pinned Collector spanmetrics connector derives bounded HTTP diagnostic histograms before tail sampling, with exemplars linking measurements to Tempo. These `otel_request_*` diagnostics remain separate from canonical unsampled `http_server_*` application metrics. A retained error, slow or development trace resolves its exemplar; ordinary traces can be discarded by tail sampling. The connector is experimental in this pinned Collector release. Its cardinality limit is 2,000, resource cache 128, and metric expiration five minutes; include its CPU and memory in capacity planning.

The dashboard comparison compute worker initializes its SDK before application imports and carries only traceparent through its internal transport. Results return before export finishes. Each disposable worker retains its concurrency slot for at most one second during telemetry shutdown; exporter outages can temporarily exhaust the configured compute slots. The bounded grace can drop unsent telemetry.

Backend builds retain the runtime NODE_ENV lookup so deployment environment resources and log fields do not inherit the build host environment. Docker contexts exclude environment files; provide database configuration through the documented build secret.

### Diagnostic overhead measurement

A paired local run (`accounts`, `categories`, `creditCards`; `--diagnostic`: five samples, load 1, 10,000 transactions, same release bundle, API restarted between modes, host load average about 9) measured p95 in ms, telemetry off versus on with a local Collector:

| Scenario    | Redis cold | Hot     | 304     |
| ----------- | ---------- | ------- | ------- |
| accounts    | 564 / 395  | 6 / 21  | 6 / 25  |
| categories  | 39 / 104   | 10 / 30 | 9 / 27  |
| creditCards | 590 / 632  | 19 / 34 | 22 / 18 |

With five samples on a loaded host these figures only bound the overhead (roughly tens of milliseconds on cached reads, within noise on cold reads); they are not acceptance results.
