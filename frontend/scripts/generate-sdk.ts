import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { directoryFingerprint, fileFingerprint, generateWhenChanged } from "./sdk-generation-cache";

const frontend = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(frontend, "package.json"));
const helperDirectory = dirname(require.resolve("@hyoretsu/kubb/config"));
const inputs = [
	resolve(frontend, "../backend/out/openapi.json"),
	resolve(frontend, "kubb.config.ts"),
	resolve(frontend, "package.json"),
	resolve(frontend, "../bun.lock"),
	import.meta.filename,
	resolve(import.meta.dirname, "sdk-generation-cache.ts"),
];

const generated = await generateWhenChanged({
	cacheFile: resolve(frontend, ".cache/kubb-generation.json"),
	generate: async () => {
		const child = Bun.spawn([process.execPath, "x", "--no-install", "kubb", "generate"], {
			cwd: frontend,
			env: { ...process.env, KUBB_DISABLE_TELEMETRY: "1" },
			stderr: "inherit",
			stdout: "inherit",
		});
		const code = await child.exited;
		if (code !== 0) throw new Error(`Kubb generation failed (exit ${code}).`);
	},
	inputFingerprint: async () =>
		createHash("sha256")
			.update(
				JSON.stringify([
					Bun.version,
					process.version,
					await Promise.all(inputs.map(fileFingerprint)),
					// Include local helper builds as well as the versions pinned in bun.lock.
					await directoryFingerprint(helperDirectory),
				]),
			)
			.digest("hex"),
	outputDirectory: resolve(frontend, "src/lib/api/generated/api"),
});

if (!generated)
	console.log("Kubb: contract and generator inputs unchanged; SDK files verified, skipping generation.");
