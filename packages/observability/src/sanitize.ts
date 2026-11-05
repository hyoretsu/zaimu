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
		if (Array.isArray(item))
			return {
				count: item.length,
				items: Object.getOwnPropertyNames(item)
					.filter(k => /^\d+$/.test(k))
					.slice(0, 20)
					.map(k => {
						const descriptor = Object.getOwnPropertyDescriptor(item, k);
						return descriptor && "value" in descriptor
							? walk(descriptor.value, depth + 1)
							: "[accessor]";
					}),
			};
		const output: Record<string, unknown> = {};
		for (const key of Object.getOwnPropertyNames(item).slice(0, 20)) {
			const descriptor = Object.getOwnPropertyDescriptor(item, key);
			// Unapproved property names can contain user data too.
			const label = technical.has(key) ? key : `field_${Object.keys(output).length}`;
			output[label] =
				descriptor && "value" in descriptor ? walk(descriptor.value, depth + 1, key) : "[accessor]";
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
