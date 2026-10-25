import { relative } from "node:path";
import { cwd } from "node:process";

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

// lint-staged parses command strings directly; it does not invoke a shell.
const quote = filename => {
	if (filename.includes('"') && filename.includes("'"))
		throw new Error("lint-staged cannot parse filenames containing both quote styles");
	return filename.includes('"') ? `'${filename}'` : `"${filename}"`;
};

export default {
	"*": filenames => {
		const files = filenames.filter(filename => !isIgnoredFile(filename));
		const commands = ["bun scripts/validate-staged.ts"];
		if (files.length === 0) return commands;
		const paths = files.map(quote).join(" ");
		commands.push(
			`bunx biome check --formatter-enabled=false --diagnostic-level=error --files-ignore-unknown=true --no-errors-on-unmatched --write --unsafe ${paths}`,
		);
		const scripts = files.filter(filename => /\.(cjs|js|jsx|mjs|ts|tsx)$/.test(filename));
		if (scripts.length > 0) commands.push(`bunx eslint --quiet --fix ${scripts.map(quote).join(" ")}`);
		// Run last so lint fixes cannot leave code outside the formatter's canonical output.
		commands.push(`bun fmt --ignore-unknown --no-error-on-unmatched-pattern ${paths}`);
		return commands;
	},
};
