import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileFingerprint, generateWhenChanged } from "./sdk-generation-cache";

const temporaryDirectories: string[] = [];
afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })));
});

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "sdk-cache-"));
	temporaryDirectories.push(root);
	const contract = join(root, "openapi.json");
	const config = join(root, "kubb.config.ts");
	const dependency = join(root, "bun.lock");
	const backend = join(root, "controller.ts");
	const outputDirectory = join(root, "generated");
	const cacheFile = join(root, "cache.json");
	await Promise.all([contract, config, dependency, backend].map(path => writeFile(path, "initial")));
	let calls = 0;
	const options = {
		cacheFile,
		generate: async () => {
			calls++;
			await mkdir(outputDirectory, { recursive: true });
			await writeFile(join(outputDirectory, "client.ts"), await readFile(contract));
		},
		inputFingerprint: async () =>
			JSON.stringify(await Promise.all([contract, config, dependency].map(fileFingerprint))),
		outputDirectory,
	};
	return {
		...options,
		backend,
		calls: () => calls,
		config,
		contract,
		dependency,
		run: () => generateWhenChanged(options),
	};
}

test("backend implementation changes with identical contracts skip the generator", async () => {
	const state = await fixture();
	expect(await state.run()).toBe(true);
	await writeFile(state.backend, "changed implementation, same exported API");
	expect(await state.run()).toBe(false);
	expect(state.calls()).toBe(1);
});

test("contract, configuration and dependency changes invalidate the cache", async () => {
	const state = await fixture();
	await state.run();
	for (const path of [state.contract, state.config, state.dependency]) {
		await writeFile(path, "changed");
		expect(await state.run()).toBe(true);
	}
	expect(state.calls()).toBe(4);
});

test("missing, edited and extra generated files cannot produce false cache hits", async () => {
	const state = await fixture();
	await state.run();
	await rm(state.outputDirectory, { recursive: true });
	expect(await state.run()).toBe(true);
	await writeFile(join(state.outputDirectory, "client.ts"), "corrupted");
	expect(await state.run()).toBe(true);
	await writeFile(join(state.outputDirectory, "unexpected.ts"), "stale");
	expect(await state.run()).toBe(true);
	expect(state.calls()).toBe(4);
});

test("failed generation and malformed markers are retried", async () => {
	const state = await fixture();
	await state.run();
	await writeFile(state.cacheFile, "invalid json");
	expect(await state.run()).toBe(true);
	await writeFile(state.contract, "new contract");
	await expect(
		generateWhenChanged({
			...state,
			generate: async () => {
				throw new Error("generator failed");
			},
		}),
	).rejects.toThrow("generator failed");
	expect(await state.run()).toBe(true);
	expect(state.calls()).toBe(3);
});

test("inputs changed during generation never publish a success marker", async () => {
	const state = await fixture();
	await expect(
		generateWhenChanged({
			...state,
			generate: async () => {
				await state.generate();
				await writeFile(state.contract, "changed while generating");
			},
		}),
	).rejects.toThrow("SDK inputs changed");
	expect(await state.run()).toBe(true);
	expect(await state.run()).toBe(false);
});
