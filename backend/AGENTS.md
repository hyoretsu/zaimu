# Backend Guidelines

Bun + Elysia + TypeBox API (`src/main.ts`, `src/worker.ts`). Modules live in `src/modules/<module>/{application,domain,infra,tests}`. Shared rules live in the root [`AGENTS.md`](../AGENTS.md); Zaimu backend invariants (Redis/RabbitMQ namespaces, batching, migrations) live in [`docs/engineering-rules.md`](../docs/engineering-rules.md). Use the `backend-endpoint-sdk` skill when adding or changing an endpoint.

## DTOs

DTOs are TypeBox schemas, never TypeScript interfaces; derive the type with `typeof XxxDTO.static`:

```ts
export const CreateReceiptDTO = t.Object({
	...CreateReceiptBody.properties,
	companyId: t.Optional(t.String()),
	filename: t.String(),
});
export type CreateReceiptDTO = typeof CreateReceiptDTO.static;
```

Compose with a single `t.Object` and a `.properties` spread. `t.Intersect` is lint-forbidden: it resolves poorly at runtime.

## Response typing

Name return DTOs `XxxReturn` or `XxxResult` (domain naming, no HTTP knowledge). In the Elysia controller pass them under `response:`, never `result:`; Elysia ignores `result` and Kubb then generates `any` in the SDK.

```ts
.get("/revenue", handler, { response: GetRevenueReturn })
```

## Tests

Bun test runner via `bun run test:unit | test:integration | test:e2e` (they delegate to `scripts/test-runner.ts`, which starts disposable services). Placement rules are in the root `AGENTS.md`.

## Enums

Status and error enums are contracts the frontend translates. A new or changed enum member needs matching translation keys in every locale file in the same change (see "i18n" in the root `AGENTS.md`).
