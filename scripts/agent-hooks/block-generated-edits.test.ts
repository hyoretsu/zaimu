import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { editedPaths, findGenerated } from "./block-generated-edits";

const root = resolve(import.meta.dir, "../..");

describe("block-generated-edits", () => {
	test("reads Claude file_path edits", () => {
		expect(editedPaths({ tool_input: { file_path: "/a/b.ts" } })).toEqual(["/a/b.ts"]);
	});

	test("reads every file of a Codex apply_patch envelope", () => {
		const command = [
			"*** Begin Patch",
			"*** Update File: frontend/src/a.ts",
			"@@",
			"-a",
			"+b",
			"*** Add File: backend/src/b.ts",
			"+x",
			"*** Delete File: c.ts",
			"*** Move to: d.ts",
			"*** End Patch",
		].join("\n");
		expect(editedPaths({ tool_input: { command } })).toEqual([
			"frontend/src/a.ts",
			"backend/src/b.ts",
			"c.ts",
			"d.ts",
		]);
	});

	test("blocks generated files for absolute and cwd-relative paths", () => {
		const sdk = "frontend/src/lib/api/generated/index.ts";
		expect(findGenerated({ tool_input: { file_path: resolve(root, sdk) } })?.path).toBe(sdk);
		expect(
			findGenerated({
				cwd: resolve(root, "frontend"),
				tool_input: { file_path: "src/routeTree.gen.ts" },
			})?.path,
		).toBe("frontend/src/routeTree.gen.ts");
	});

	test("blocks a generated file inside a multi-file patch", () => {
		const command =
			"*** Begin Patch\n*** Update File: backend/src/ok.ts\n*** Update File: backend/generated/prisma/client.ts\n*** End Patch";
		expect(findGenerated({ cwd: root, tool_input: { command } })?.path).toBe(
			"backend/generated/prisma/client.ts",
		);
	});

	test("allows regular files, lookalike names and paths outside the repository", () => {
		expect(
			findGenerated({ tool_input: { file_path: resolve(root, "frontend/src/lib/api/client-api.ts") } }),
		).toBeUndefined();
		expect(
			findGenerated({
				tool_input: { file_path: resolve(root, "frontend/src/lib/api/generated-notes.md") },
			}),
		).toBeUndefined();
		expect(findGenerated({ tool_input: { file_path: "/tmp/other/generated/x.ts" } })).toBeUndefined();
	});
});
