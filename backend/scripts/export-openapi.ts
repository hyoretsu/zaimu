import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { toOpenAPISchema } from "@elysiajs/openapi";
import { TypeGuard } from "@sinclair/typebox/type";
import { operationId } from "../src/shared/infra/elysia/operation-id";
import { serializedResponse } from "../src/shared/infra/elysia/serialized-response";
import {
	HttpErrorReturn,
	transportModels,
	transportResponses,
} from "../src/shared/infra/elysia/transport-responses";

// Import route declarations only. Never listen or execute an endpoint during export.
const { server } = await import("../src/server");
server.model(transportModels);
for (const route of server.routes) {
	const key = `${route.method.toLowerCase()} ${route.path.replace(/:[^/]+/g, "{}").replace(/\/$/, "")}`;
	if (!route.hooks.response && Object.hasOwn(transportResponses, key))
		route.hooks.response = transportResponses[key as keyof typeof transportResponses];
}
// The plugin mistakes a TypeBox union for a status-code map. Preserve the schema under 200.
for (const route of server.routes) {
	const response = route.hooks.response;
	if (response && typeof response === "object" && ("anyOf" in response || "oneOf" in response))
		route.hooks.response = { 200: response };
}
for (const route of server.routes) {
	const response = route.hooks.response;
	if (!response || typeof response !== "object") continue;
	if ("type" in response || "anyOf" in response || "$ref" in response)
		route.hooks.response = serializedResponse(response);
	else
		route.hooks.response = Object.fromEntries(
			Object.entries(response).map(([status, contract]) => [
				status,
				TypeGuard.IsSchema(contract) ? serializedResponse(contract) : contract,
			]),
		);
}
const schema = toOpenAPISchema(server, {
	paths: ["/docs", "/docs/json"],
});
// TypeBox Date is a runtime type; OpenAPI describes its serialized JSON form.
function jsonSchema(value: unknown): void {
	if (Array.isArray(value)) {
		for (const child of value) jsonSchema(child);
		return;
	}
	if (!value || typeof value !== "object") return;
	if ("type" in value && value.type === "Date") {
		value.type = "string";
		Object.assign(value, { format: "date-time" });
	}
	for (const child of Object.values(value)) jsonSchema(child);
}
jsonSchema(schema);
// Named return contracts can also be referenced by coercing request schemas (for example sync).
// Export their decoded JSON form consistently with inline route responses.
for (const [name, contract] of Object.entries(schema.components?.schemas ?? {})) {
	if (name.endsWith("Return") && schema.components?.schemas)
		schema.components.schemas[name] = serializedResponse(
			contract as Parameters<typeof serializedResponse>[0],
		);
}
const identifiers = new Set<string>();
for (const [path, methods] of Object.entries(schema.paths)) {
	for (const method of ["get", "post", "put", "patch", "delete", "head", "options"] as const) {
		const operation = methods?.[method];
		if (!operation) continue;
		operation.operationId = operationId(method, path);
		if (identifiers.has(operation.operationId))
			throw new Error(`Duplicate operation: ${operation.operationId}`);
		identifiers.add(operation.operationId);
		operation.tags ??= [path.split("/").filter(Boolean)[0] ?? "Health"];
		if (!operation.responses || !Object.keys(operation.responses).length)
			throw new Error(`Missing responses: ${method} ${path}`);
		for (const [status, response] of Object.entries(operation.responses)) {
			if ((status === "204" || status === "304") && "content" in response) delete response.content;
		}
		for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 503]) {
			operation.responses[status] ??= {
				content: { "application/json": { schema: HttpErrorReturn } },
				description: `HTTP ${status}`,
			};
		}
	}
}
const output = resolve(import.meta.dir, "../out/openapi.json");
await mkdir(resolve(import.meta.dir, "../out"), { recursive: true });
await Bun.write(
	output,
	`${JSON.stringify({ info: { title: "Zaimu API", version: "1.0.0" }, openapi: "3.1.0", ...schema }, null, 2)}\n`,
);
console.log(`Exported ${identifiers.size} operations to ${output}`);
