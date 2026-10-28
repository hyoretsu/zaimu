---
name: backend-endpoint-sdk
description: "Add or change a backend endpoint, DTO or response type and propagate it to the generated frontend SDK. Use when touching Elysia controllers, TypeBox DTOs, OpenAPI export or Kubb generation."
---

# Backend endpoint → frontend SDK

Flow, in order:

1. Change the backend controller and DTOs under `backend/src/modules/<module>/` following `backend/AGENTS.md` (TypeBox DTOs, `.properties` spread, never `t.Intersect`, `response:` key not `result:`, `XxxReturn`/`XxxResult` names).
2. `bun run export` in `backend/`: updates the OpenAPI document.
3. `bun run generate` in `frontend/`: regenerates the SDK in `frontend/src/lib/api/generated/`.
4. Use the generated hooks from the frontend.

Rules:

- Never edit `frontend/src/lib/api/generated/`; it is overwritten on every generation.
- A hook for an endpoint not yet in the generated SDK goes in `frontend/src/lib/api/` (outside `generated/`) and is re-exported through `frontend/src/lib/api/index.ts`.
- If a generated type is `any`, the controller is probably missing `response:` or uses `result:`.
- Independent list mutations that should batch must be registered in `shared/batch-policy.ts` (see `docs/engineering-rules.md` "Action batching").
- Database changes: include `packages/sql/migrations/app/refs/db.json` with the migration commit; never run migrations against a remote/shared database without explicit authorization.
