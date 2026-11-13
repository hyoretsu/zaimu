/** Capture structure by default. Only explicitly approved technical fields retain values. */
const technical = new Set([
	"method",
	"status",
	"statusCode",
	"operation",
	"outcome",
	"retry",
	"attempt",
	"count",
	"completed",
]);
const secret =
	/token|password|secret|cookie|authorization|email|phone|document|cpf|cnpj|bank|account|balance|amount|price|payload|content|filename|url|stack|message/i;
export function summarize(value: unknown): string {
	const seen = new WeakSet<object>();
	let visited = 0;
	const walk = (item: unknown, depth: number, key = ""): unknown => {
		if (++visited > 256) return "[truncated]";
		if (secret.test(key)) return "[redacted]";
		if (item === null) return null;
		if (typeof item !== "object") {
			if (!technical.has(key)) return `[${typeof item}]`;
			if (typeof item === "string") {
				const allowed =
					key === "method"
						? ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "CONNECT", "TRACE"]
						: key === "operation"
							? [
									"SELECT",
									"INSERT",
									"UPDATE",
									"DELETE",
									"BEGIN",
									"COMMIT",
									"ROLLBACK",
									"GET",
									"SET",
									"EVAL",
								]
							: [
									"ok",
									"error",
									"success",
									"failure",
									"pending",
									"completed",
									"failed",
									"cancelled",
									"hit",
									"miss",
									"confirmed",
								];
				return item.length <= 512 && allowed.includes(item) ? item : "[string]";
			}
			return typeof item === "number"
				? Number.isFinite(item)
					? item
					: "[number]"
				: typeof item === "boolean"
					? item
					: `[${typeof item}]`;
		}
		if (depth >= 4 || seen.has(item)) return "[truncated]";
		seen.add(item);
		// Never invoke getters, iterators, toJSON or stream readers.
		if (ArrayBuffer.isView(item) || item instanceof ArrayBuffer) return "[binary]";
		if (Array.isArray(item)) {
			const length = Object.getOwnPropertyDescriptor(item, "length")?.value;
			const count = typeof length === "number" ? length : 0;
			return {
				count,
				items: Array.from({ length: Math.min(count, 20) }, (_, index) => {
					const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
					return descriptor && "value" in descriptor
						? walk(descriptor.value, depth + 1)
						: "[accessor or missing]";
				}),
			};
		}
		// Enumerating arbitrary object keys has unbounded cost, even when sliced afterwards.
		// Unknown fields remain opaque; inspect only the fixed technical allowlist.
		const output: Record<string, unknown> = { type: "[object]" };
		for (const key of technical) {
			const descriptor = Object.getOwnPropertyDescriptor(item, key);
			if (!descriptor) continue;
			output[key] = "value" in descriptor ? walk(descriptor.value, depth + 1, key) : "[accessor]";
		}
		return output;
	};
	try {
		const result = JSON.stringify(walk(value, 0));
		return new TextEncoder().encode(result).byteLength <= 8192 ? result : '"[size limit]"';
	} catch {
		return '"[unavailable]"';
	}
}
