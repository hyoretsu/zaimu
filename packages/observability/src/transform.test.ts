import { expect, test } from "bun:test";
import { registerTransformedSource } from "./source-maps";
import { transform } from "./transform";

test("transformed functions retain closures, this, sync errors, promises and generators", async () => {
	const source = `
 export function recurse(n:number):number {return n ? 1+recurse(n-1):0;}
 export class Example {constructor(public n:number){} method(){return this.n;} *values(){yield this.n;return 9;} async read(){await Promise.resolve();return this.n;}}
 export const closure=(n:number)=>()=>n;
 export function fail(){throw new TypeError('sentinel');}
 export const promise = Promise.resolve(7);
 export function identity(){return promise;}
 `;
	const output = transform(source, "/tmp/backend/src/example.ts", "/tmp/backend");
	// Load as a real file so imports and inline source maps use Bun's loader.
	const path = `${import.meta.dir}/fixture-${crypto.randomUUID()}.js`;
	await Bun.write(path, output);
	registerTransformedSource(path, output, true);
	try {
		const module = await import(path);
		expect(module.recurse(5)).toBe(5);
		const instance = new module.Example(3);
		expect(instance.method()).toBe(3);
		expect(await instance.read()).toBe(3);
		expect(instance.values().next()).toEqual({ done: false, value: 3 });
		expect(module.closure(4)()).toBe(4);
		expect(module.fail).toThrow("sentinel");
		try {
			module.fail();
		} catch (error) {
			expect((error as Error).stack).toContain(
				`example.ts:${source.split("\n").findIndex(line => line.includes("export function fail")) + 1}:`,
			);
		}
		expect(module.identity()).toBe(module.promise);
		expect(output).toContain("sourceMappingURL=data:");
	} finally {
		await Bun.file(path).delete();
	}
});
