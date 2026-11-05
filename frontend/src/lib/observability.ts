import { initializeBrowser } from "@zaimu/observability/browser";

const api = new URL(import.meta.env.VITE_API_URL || "http://localhost:3333");
export const telemetry = initializeBrowser({
	apiOrigin: api.origin,
	enabled: import.meta.env.VITE_OTEL_ENABLED === "true",
	endpoint: new URL("/telemetry/traces", api).href,
	project: "zaimu",
	tauri: "__TAURI_INTERNALS__" in window,
	version: import.meta.env.VITE_OTEL_SERVICE_VERSION || "development",
});
