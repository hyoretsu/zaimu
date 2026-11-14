import { composeBuildMaps, instrumentationPlugin } from "@zaimu/observability/plugin";

const result = await Bun.build({
	define: { "process.env.NODE_ENV": "process.env.NODE_ENV" },
	entrypoints: ["src/main.ts", "src/worker.ts", "src/modules/dashboard/infra/workers/comparison.worker.ts"],
	external: ["pdf-parse"],
	outdir: "dist",
	plugins: [instrumentationPlugin(process.cwd())],
	sourcemap: "linked",
	target: "bun",
});
if (!result.success) {
	console.error(result.logs);
	process.exit(1);
}

if (result.success) await composeBuildMaps(result.outputs);
