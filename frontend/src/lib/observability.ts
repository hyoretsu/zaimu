import { initializeBrowser } from "@zaimu/observability/browser";

const api = new URL(import.meta.env.VITE_API_URL || "http://localhost:3333");
export const telemetry = initializeBrowser({
	apiOrigin: api.origin,
	// On by default in production builds; VITE_OTEL_ENABLED=false/true overrides in either mode.
	enabled: (import.meta.env.VITE_OTEL_ENABLED || String(import.meta.env.PROD)) === "true",
	endpoint: new URL("/telemetry/traces", api).href,
	project: "zaimu",
	tauri: "__TAURI_INTERNALS__" in window,
	version: import.meta.env.MODE,
});
