import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function directoryFingerprint(directory: string): Promise<string | undefined> {
	const hash = createHash("sha256");
	let files = 0;
	async function visit(path: string, prefix = "") {
		const entries = await readdir(path, { withFileTypes: true });
		for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
			const name = `${prefix}${entry.name}`;
			if (entry.isDirectory()) await visit(join(path, entry.name), `${name}/`);
			else {
				hash.update(JSON.stringify([name, await fileFingerprint(join(path, entry.name))]));
				files++;
			}
		}
	}
	try {
		await visit(directory);
	} catch (error) {
		if (isMissing(error)) return undefined;
		throw error;
	}
	return files ? hash.digest("hex") : undefined;
}

export async function fileFingerprint(path: string) {
	return createHash("sha256")
		.update(await readFile(path))
		.digest("hex");
}

function isMissing(error: unknown) {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Turbo still orders exports; this check ignores changes to their task hashes. */
export async function generateWhenChanged(options: {
	cacheFile: string;
	outputDirectory: string;
	inputFingerprint: () => Promise<string>;
	generate: () => Promise<void>;
}): Promise<boolean> {
	const input = await options.inputFingerprint();
	try {
		const previous: unknown = JSON.parse(await readFile(options.cacheFile, "utf8"));
		if (
			previous !== null &&
			typeof previous === "object" &&
			"input" in previous &&
			previous.input === input &&
			"output" in previous &&
			typeof previous.output === "string" &&
			previous.output === (await directoryFingerprint(options.outputDirectory))
		)
			return false;
	} catch (error) {
		if (!isMissing(error) && !(error instanceof SyntaxError)) throw error;
	}
	// A failed/interrupted generation must never leave a valid success marker.
	await rm(options.cacheFile, { force: true });
	await options.generate();
	if (input !== (await options.inputFingerprint())) {
		throw new Error("SDK inputs changed during generation. Run generation again.");
	}
	const output = await directoryFingerprint(options.outputDirectory);
	if (!output) throw new Error("SDK generation produced no files.");
	await mkdir(dirname(options.cacheFile), { recursive: true });
	const temporary = `${options.cacheFile}.${process.pid}.tmp`;
	try {
		await writeFile(temporary, JSON.stringify({ input, output }));
		await rename(temporary, options.cacheFile);
	} finally {
		await rm(temporary, { force: true });
	}
	return true;
}
