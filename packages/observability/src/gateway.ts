import { metrics } from "@opentelemetry/api";

const signalDuration = metrics.getMeter("client").createHistogram("client.signal.duration", {
	advice: { explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10] },
	unit: "s",
});
const signalCount = metrics.getMeter("client").createCounter("client.signal.count");
const vitalValue = metrics.getMeter("client").createHistogram("client.vital.value");
const names = new Set(["client.fetch", "client.navigation", "client.error", "client.vital"]);
const buckets = new Map<string, { count: number; until: number }>();
const hex = (value: unknown, length: number): value is string =>
	typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value) && !/^0+$/.test(value);
const nanos = (value: unknown): value is string => typeof value === "string" && /^\d{16,20}$/.test(value);
/** Strict OTLP/JSON trace subset. Arbitrary OTLP attributes and logs are never proxied. */
export function clientGateway(project: string, origins: string[]) {
	return async (request: Request, ip = "local"): Promise<Response> => {
		if (process.env.OTEL_ENABLED !== "true") return new Response(null, { status: 404 });
		const origin = request.headers.get("origin");
		if (!origin || !origins.includes(origin)) return new Response(null, { status: 403 });
		const now = Date.now();
		for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
		if (buckets.size >= 10000 && !buckets.has(ip)) return new Response(null, { status: 429 });
		const bucket = buckets.get(ip) ?? { count: 0, until: now + 60000 };
		buckets.set(ip, bucket);
		if (++bucket.count > 30) return new Response(null, { headers: { "Retry-After": "60" }, status: 429 });
		if (
			request.headers.get("content-encoding") ||
			!request.headers.get("content-type")?.startsWith("application/json")
		)
			return new Response(null, { status: 415 });
		if (Number(request.headers.get("content-length")) > 65536) return new Response(null, { status: 413 });
		const reader = request.body?.getReader();
		if (!reader) return new Response(null, { status: 400 });
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const chunks: Uint8Array[] = [];
			let size = 0;
			const read = async () => {
				while (true) {
					const next = await reader.read();
					if (next.done) break;
					size += next.value.byteLength;
					if (size > 65536) throw Error("size");
					chunks.push(next.value);
				}
			};
			await Promise.race([
				read(),
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(Error("timeout")), 3000);
				}),
			]);
			const bytes = new Uint8Array(size);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.byteLength;
			}
			const parsed = JSON.parse(new TextDecoder().decode(bytes));
			if (!Array.isArray(parsed.resourceSpans) || parsed.resourceSpans.length > 2) throw Error("shape");
			let count = 0;
			const resourceSpans = parsed.resourceSpans.map((resource: Record<string, unknown>) => {
				const raw = resource as {
					resource?: { attributes?: { key: string; value: { stringValue?: string } }[] };
					scopeSpans?: { spans?: Record<string, unknown>[] }[];
				};
				const version = raw.resource?.attributes?.find(
					attribute => attribute.key === "service.version",
				)?.value.stringValue;
				const releases = (
					process.env.OTEL_CLIENT_VERSIONS ??
					process.env.OTEL_SERVICE_VERSION ??
					"development"
				)
					.split(",")
					.slice(0, 10);
				const safeVersion =
					typeof version === "string" &&
					/^[a-zA-Z0-9._-]{1,64}$/.test(version) &&
					releases.includes(version)
						? version
						: "unknown";
				const instance = raw.resource?.attributes?.find(
					attribute => attribute.key === "service.instance.id",
				)?.value.stringValue;
				const safeInstance =
					typeof instance === "string" &&
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instance)
						? instance
						: undefined;
				const service = raw.resource?.attributes?.find(attribute => attribute.key === "service.name")
					?.value.stringValue;
				if (service !== `${project}-web` && service !== `${project}-tauri`) throw Error("service");
				if (!Array.isArray(raw.scopeSpans) || raw.scopeSpans.length > 4) throw Error("scope");
				const spans = raw.scopeSpans.flatMap(scope => {
					if (!Array.isArray(scope.spans)) throw Error("spans");
					return scope.spans.map(span => {
						if (
							++count > 64 ||
							!names.has(String(span.name)) ||
							!hex(span.traceId, 32) ||
							!hex(span.spanId, 16) ||
							!nanos(span.startTimeUnixNano) ||
							!nanos(span.endTimeUnixNano)
						)
							throw Error("span");
						const duration =
							Number(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / 1e9;
						if (duration < 0 || duration > 3600) throw Error("duration");
						const attrs = { "client.service": service, "client.signal": String(span.name) };
						signalCount.add(1, attrs);
						signalDuration.record(duration, attrs);
						const inputAttributes = Array.isArray(span.attributes)
							? (span.attributes as {
									key?: string;
									value?: {
										stringValue?: string;
										doubleValue?: number;
										intValue?: number | string;
									};
								}[])
							: [];
						const vitalName = inputAttributes.find(
							attribute => attribute.key === "client.vital.name",
						)?.value?.stringValue;
						const value = inputAttributes.find(
							attribute => attribute.key === "client.vital.value",
						)?.value;
						const number = Number(value?.doubleValue ?? value?.intValue);
						const attributes = [];
						if (
							vitalName &&
							["CLS", "INP", "LCP", "FCP", "TTFB"].includes(vitalName) &&
							Number.isFinite(number) &&
							number >= 0 &&
							number <= 3600000
						) {
							vitalValue.record(number, {
								"client.service": service,
								"client.vital.name": vitalName,
							});
							attributes.push(
								{ key: "client.vital.name", value: { stringValue: vitalName } },
								{ key: "client.vital.value", value: { doubleValue: number } },
							);
						}
						return {
							attributes,
							endTimeUnixNano: span.endTimeUnixNano,
							kind: 1,
							name: span.name,
							spanId: span.spanId,
							startTimeUnixNano: span.startTimeUnixNano,
							status: { code: (span.status as { code?: number })?.code === 2 ? 2 : 0 },
							traceId: span.traceId,
						};
					});
				});
				return {
					resource: {
						attributes: [
							{ key: "service.name", value: { stringValue: service } },
							{ key: "service.namespace", value: { stringValue: project } },
							{ key: "service.version", value: { stringValue: safeVersion } },
							...(safeInstance
								? [{ key: "service.instance.id", value: { stringValue: safeInstance } }]
								: []),
							{
								key: "deployment.environment.name",
								value: { stringValue: process.env.NODE_ENV ?? "development" },
							},
						],
					},
					scopeSpans: [{ scope: { name: "client" }, spans }],
				};
			});
			const base = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318").replace(
				/\/$/,
				"",
			);
			let response: Response;
			try {
				response = await fetch(`${base}/v1/traces`, {
					body: JSON.stringify({ resourceSpans }),
					headers: { "content-type": "application/json" },
					method: "POST",
					signal: AbortSignal.timeout(3000),
				});
			} catch {
				return new Response(null, { status: 503 });
			}
			return new Response(response.ok ? "{}" : null, {
				headers: { "content-type": "application/json" },
				status: response.ok ? 200 : 503,
			});
		} catch {
			return new Response(null, { status: 400 });
		} finally {
			if (timer) clearTimeout(timer);
			void reader.cancel().catch(() => {});
		}
	};
}
