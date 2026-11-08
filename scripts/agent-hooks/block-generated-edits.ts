import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * PreToolUse hook shared by Claude Code (`.claude/settings.json`) and Codex (`.codex/hooks.json`).
 * Blocks edits to generated files by exiting 2 with the reason on stderr, which both agents treat as a denial.
 */

interface HookPayload {
	cwd?: string;
	tool_input?: { command?: unknown; file_path?: unknown; notebook_path?: unknown };
}

const root = resolve(import.meta.dir, "../..");

const generated = [
	{
		hint: "Run `bun run export` in backend, then `bun run generate` in frontend.",
		pattern: /^frontend\/src\/lib\/api\/generated\//,
	},
	{ hint: "Regenerate it with the backend `generate` script.", pattern: /^backend\/(?:src\/)?generated\// },
	{ hint: "Regenerate it with the Tauri CLI.", pattern: /^frontend\/src-tauri\/gen\// },
	{ hint: "Regenerate it with `bun run export` in packages/sql.", pattern: /^packages\/sql\/out\// },
	{ hint: "Regenerate it through the build (TanStack Router plugin).", pattern: /\.gen\.ts$/ },
];

// Codex reports edits as an `apply_patch` envelope in `tool_input.command`.
const patchHeader = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;

export const editedPaths = ({ tool_input: input }: HookPayload) => {
	const paths: string[] = [];
	for (const key of ["file_path", "notebook_path"] as const) {
		const value = input?.[key];
		if (typeof value === "string") paths.push(value);
	}
	if (typeof input?.command === "string") {
		for (const match of input.command.matchAll(patchHeader)) paths.push(match[1].trim());
	}
	return paths;
};

export const findGenerated = (payload: HookPayload) => {
	const cwd = payload.cwd ?? process.cwd();
	for (const path of editedPaths(payload)) {
		const repoPath = relative(root, isAbsolute(path) ? path : resolve(cwd, path))
			.split(sep)
			.join("/");
		if (repoPath.startsWith("..")) continue;
		const match = generated.find(({ pattern }) => pattern.test(repoPath));
		if (match) return { hint: match.hint, path: repoPath };
	}
};

if (import.meta.main) {
	let payload: HookPayload = {};
	try {
		payload = JSON.parse((await Bun.stdin.text()) || "{}");
	} catch {
		// Malformed input must never block the agent.
	}
	const found = findGenerated(payload);
	if (found) {
		console.error(
			`Blocked: ${found.path} is generated and is overwritten on regeneration. ${found.hint}`,
		);
		process.exit(2);
	}
}
