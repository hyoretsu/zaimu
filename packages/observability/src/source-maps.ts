import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import remapping from "@ampproject/remapping";
import { install } from "source-map-support";
const maps = new Map<string, string>();
let installed = false;
const filename = (value: string) => (value.startsWith("file://") ? fileURLToPath(value) : value);
export function registerTransformedSource(path: string, contents: string, runtime = false) {
	const match = contents.match(
		/sourceMappingURL=data:application\/json(?:;charset=utf-8)?;base64,([^\s]+)/,
	);
	if (!match) return;
	maps.set(filename(path), Buffer.from(match[1]!, "base64").toString());
	if (runtime && !installed) {
		installed = true;
		install({
			environment: "node",
			retrieveSourceMap(source) {
				const map = maps.get(filename(source));
				return map ? { map, url: source } : null;
			},
		});
	}
}
/** Compose Bun's bundle map with the AST transform map rather than mapping to generated JS. */
export async function composeBuildMaps(outputs: ReadonlyArray<{ path: string }>) {
	for (const output of outputs) {
		if (!output.path.endsWith(".map")) continue;
		const original = await Bun.file(output.path).json();
		const composed = remapping(original, (source, context) => {
			if (context.depth > 1) return null;
			const map = maps.get(resolve(dirname(output.path), source));
			return map ? JSON.parse(map) : null;
		});
		await Bun.write(output.path, JSON.stringify({ ...original, ...JSON.parse(composed.toString()) }));
	}
}
