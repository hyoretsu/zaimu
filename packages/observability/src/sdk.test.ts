import { expect, test } from "bun:test";
test("collector outage cannot fail application work or keep shutdown open", () => {
	const child = Bun.spawnSync(
		[
			process.execPath,
			"--eval",
			`import {initialize,shutdown} from ${JSON.stringify(import.meta.resolve("./sdk"))};import {operation} from ${JSON.stringify(import.meta.resolve("./index"))};console.log("sdk.loaded");initialize("api","fixture");console.log("sdk.initialized");if(await operation("fixture",async()=>42)!==42)process.exit(2);const started=performance.now();await shutdown();console.log(JSON.stringify({shutdownMs:performance.now()-started}));`,
		],
		{
			env: {
				...process.env,
				OTEL_ENABLED: "true",
				OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:1",
				OTEL_LOG_LEVEL: "error",
			},
			stderr: "pipe",
			stdout: "pipe",
			timeout: 45000,
		},
	);
	expect({
		code: child.exitCode,
		errors: child.stderr.toString(),
		output: child.stdout.toString(),
	}).toMatchObject({ code: 0 });
	const result = JSON.parse(child.stdout.toString().trim().split("\n").at(-1)!);
	expect(result.shutdownMs).toBeLessThan(6000);
}, 50000);
