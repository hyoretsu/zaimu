import { initialize, shutdown } from "@zaimu/observability/sdk";

initialize("api", "zaimu");
process.on("SIGTERM", async () => {
	await shutdown();
	process.exit(0);
});
process.on("SIGINT", async () => {
	await shutdown();
	process.exit(0);
});
await import("./api");
