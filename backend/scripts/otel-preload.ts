import { instrumentationPlugin } from "@zaimu/observability/plugin";
import { plugin } from "bun";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim())
	plugin(instrumentationPlugin(import.meta.dir.replace(/\/scripts$/, ""), true));
