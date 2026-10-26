import { Value } from "@sinclair/typebox/value";
import Elysia from "elysia";
import { BATCH_MAX_BYTES, isBatchAction } from "../../../../../../shared/batch-policy";
import { BatchBody, BatchErrorReturn, BatchResult } from "../../dtos/BatchDTO";

/** Dispatch through the application's normal auth, validation and transaction hooks. */
export function createBatchController(
	handle: (request: Request) => Response | Promise<Response>,
	inheritSession: (parent: Request, child: Request) => void,
) {
	const bodies = new WeakMap<Request, BatchBody>();
	return new Elysia({ name: "BatchController" })
		.onRequest(async ({ request }) => {
			if (request.method !== "POST" || new URL(request.url).pathname !== "/batch") return;
			const reader = request.body?.getReader();
			if (!reader) return;
			const chunks: Uint8Array[] = [];
			let size = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				size += value.byteLength;
				if (size > BATCH_MAX_BYTES) {
					await reader.cancel();
					return Response.json({ error: "Lote excede 1 MiB." }, { status: 413 });
				}
				chunks.push(value);
			}
			const bytes = new Uint8Array(size);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.byteLength;
			}
			let body: unknown;
			try {
				body = JSON.parse(new TextDecoder().decode(bytes));
			} catch {
				return Response.json({ error: "JSON inválido." }, { status: 400 });
			}
			if (!Value.Check(BatchBody, body))
				return Response.json({ error: "Lote inválido." }, { status: 422 });
			bodies.set(request, body);
		})
		.post(
			"/batch",
			async ({ body, request }) => {
				if (new TextEncoder().encode(JSON.stringify(body)).byteLength > BATCH_MAX_BYTES)
					return Response.json({ error: "Lote excede 1 MiB." }, { status: 413 });
				if (new Set(body.operations.map(operation => operation.id)).size !== body.operations.length)
					return Response.json(
						{ error: "Identificadores de ações devem ser únicos." },
						{ status: 422 },
					);
				const results: BatchResult["results"] = [];
				for (const operation of body.operations) {
					if (!isBatchAction(operation.method, operation.path)) {
						results.push({
							data: { error: "Ação não permitida em lote." },
							id: operation.id,
							status: 400,
						});
						continue;
					}
					const headers = new Headers();
					for (const name of [
						"cookie",
						"authorization",
						"origin",
						"x-currency",
						"x-correlation-id",
					])
						if (request.headers.has(name)) headers.set(name, request.headers.get(name)!);
					headers.set("content-type", "application/json");
					const child = new Request(new URL(operation.path, request.url).toString(), {
						body: operation.body === undefined ? undefined : JSON.stringify(operation.body),
						headers,
						method: operation.method,
					});
					inheritSession(request, child);
					try {
						const response = await handle(child);
						const text = await response.text();
						results.push({
							data: text ? JSON.parse(text) : null,
							id: operation.id,
							status: response.status,
						});
					} catch {
						results.push({
							data: { error: "Não foi possível concluir a ação." },
							id: operation.id,
							status: 500,
						});
					}
				}
				return Response.json({ results });
			},
			{
				body: BatchBody,
				parse: ({ request }) => bodies.get(request),
				response: {
					200: BatchResult,
					400: BatchErrorReturn,
					413: BatchErrorReturn,
					422: BatchErrorReturn,
				},
			},
		);
}
