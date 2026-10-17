import { readFileSync } from "node:fs";
import path from "node:path";
import { Oas } from "@kubb/oas";

await new Oas(
	JSON.parse(readFileSync(path.resolve(__dirname, "../backend/out/openapi.json"), "utf8")),
).validate();

import { createConfig } from "@hyoretsu/kubb/config";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";

const config = createConfig({
	config: {
		api: {
			jsonPath: path.resolve(__dirname, "../backend/out/openapi.json"),
			name: "api",
		},
	},
	exclude: [
		{
			pattern: "External",
			type: "tag",
		},
	],
});

export default config.map(project => ({
	...project,
	plugins: project.plugins?.map(plugin =>
		plugin.name === "plugin-ts"
			? pluginTs({
					dateType: "string",
					emptySchemaType: "unknown",
					enumType: "inlineLiteral",
					exclude: [{ pattern: "External", type: "tag" }],
					unknownType: "unknown",
				})
			: plugin.name === "plugin-zod"
				? pluginZod({
						...plugin.options,
						dateType: "string",
						emptySchemaType: "unknown",
						typed: true,
						unknownType: "unknown",
					})
				: plugin,
	),
}));
