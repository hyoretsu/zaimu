import { instrumentationPlugin } from "@zaimu/observability/plugin";
import { plugin } from "bun";

if (process.env.OTEL_ENABLED === "true")
	plugin(instrumentationPlugin(import.meta.dir.replace(/\/scripts$/, ""), true));
