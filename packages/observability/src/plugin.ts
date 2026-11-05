import { registerTransformedSource } from "./source-maps";
export { composeBuildMaps } from "./source-maps";
import type { BunPlugin } from "bun";
import { transform } from "./transform";
export const instrumentationPlugin = (root: string, runtime = false): BunPlugin => ({
	name: "application-observability",
	setup(build) {
		build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
			const normalized = path.replaceAll("\\", "/");
			if (
				!normalized.startsWith(`${root}/src/`) ||
				/\/(scripts|generated|tests|observability)\/|\.(test|spec)\.ts$/.test(normalized)
			)
				return;
			const contents = transform(await Bun.file(path).text(), path, root);
			registerTransformedSource(path, contents, runtime);
			return { contents, loader: "js" };
		});
	},
});
