const colors = { debug: "\x1b[90m", error: "\x1b[31m", info: "\x1b[36m", warn: "\x1b[33m" } as const;
const hidden = new Set([
	"body",
	"environment",
	"operation_id",
	"service",
	"severity",
	"span_id",
	"stack",
	"summary",
	"timestamp",
	"trace_id",
]);

function render(value: unknown): string {
	if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
	if (typeof value === "string") return /\s/.test(value) ? JSON.stringify(value) : value;
	return JSON.stringify(value);
}

/** One readable line for a structured record, or undefined when the arguments are not one. */
export function prettyRecord(args: unknown[], method: keyof typeof colors | "log", service?: string) {
	let record: Record<string, unknown> | undefined;
	if (args.length === 1 && typeof args[0] === "string" && args[0].startsWith("{")) {
		try {
			const parsed = JSON.parse(args[0]);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) record = parsed;
		} catch {
			return undefined;
		}
	}
	if (!record) return undefined;
	const level = (
		typeof record.severity === "string" && record.severity in colors
			? record.severity
			: method === "log"
				? "info"
				: method
	) as keyof typeof colors;
	const name = String(record.type ?? record.event ?? "log");
	const fields = Object.entries(record)
		.filter(([key]) => !hidden.has(key) && key !== "type" && key !== "event")
		.map(([key, value]) => `${key}=${render(value)}`);
	const time = new Date(typeof record.timestamp === "string" ? record.timestamp : Date.now())
		.toISOString()
		.slice(11, 23);
	const color = process.stdout.isTTY ? colors[level] : "";
	const reset = color ? "\x1b[0m" : "";
	const origin = service ?? (typeof record.service === "string" ? record.service : "");
	const stack = typeof record.stack === "string" && record.stack ? `\n${record.stack}` : "";
	return (
		`${time} ${color}${level.toUpperCase().padEnd(5)}${reset} ${origin} ${name}${fields.length ? ` ${fields.join(" ")}` : ""}`.trimEnd() +
		stack
	);
}

/** Local development without a Collector: readable console output instead of raw JSON lines. */
let installed = false;
export function installPrettyConsole(service: string) {
	if (installed) return;
	installed = true;
	for (const method of ["debug", "info", "log", "warn", "error"] as const) {
		const original = console[method].bind(console);
		console[method] = (...args: unknown[]) => {
			const line = prettyRecord(args, method === "log" ? "info" : method, service);
			original(...(line === undefined ? args : [line]));
		};
	}
}
