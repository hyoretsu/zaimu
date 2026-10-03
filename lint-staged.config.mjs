import { relative } from "node:path";
import { cwd } from "node:process";
import { lintStagedConfig } from "@hyoretsu/configs/lint-staged";

const sharedConfig = lintStagedConfig();

const isIgnoredFile = filename => {
	const path = relative(cwd(), filename).replaceAll("\\", "/");

	return (
		path.startsWith(".agents/") ||
		path.startsWith(".claude/") ||
		path.startsWith("frontend/src-tauri/gen/") ||
		path === "skills-lock.json" ||
		path.endsWith(".gen.ts")
	);
};

const commandForProductFiles = (command, filenames) => {
	const productFiles = filenames.filter(filename => !isIgnoredFile(filename));

	if (productFiles.length === 0) return [];

	return `${command} ${productFiles.map(filename => JSON.stringify(filename)).join(" ")}`;
};

export default {
	...sharedConfig,
	"*.(cjs|js|jsx|mjs|ts|tsx)": filenames => commandForProductFiles("bunx eslint --quiet --fix", filenames),
	"*.(css|graphql|cjs|js|jsx|mjs|json|jsonc|ts|tsx)": filenames =>
		commandForProductFiles("bunx biome check --diagnostic-level=error --write --unsafe", filenames),
};
