import { expect, test } from "bun:test";
import { ActionBatchQueue, type BatchOperation } from "./ActionBatchQueue";
const operation = (id: string, body?: unknown): BatchOperation => ({
	body,
	id,
	method: "DELETE",
	path: `/transactions/${id}`,
});
const success = (operations: BatchOperation[]) =>
	operations.map(item => ({ data: null, id: item.id, status: 204 }));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("accumulates distinct clicks without dropping or reordering and maps partial failure", async () => {
	const calls: BatchOperation[][] = [];
	const queue = new ActionBatchQueue(
		async operations => {
			calls.push(operations);
			return success(operations).map((result, index) => ({
				...result,
				status: index === 1 ? 409 : 204,
			}));
		},
		{ debounce: 10, maxWait: 100 },
	);
	const results = await Promise.all([
		queue.enqueue(operation("a")),
		queue.enqueue(operation("b")),
		queue.enqueue(operation("c")),
	]);
	expect(calls.map(call => call.map(item => item.id))).toEqual([["a", "b", "c"]]);
	expect(results.map(result => result.status)).toEqual([204, 409, 204]);
});

test("sends at deadline under continuous clicks", async () => {
	const calls: BatchOperation[][] = [];
	const queue = new ActionBatchQueue(
		async operations => {
			calls.push(operations);
			return success(operations);
		},
		{ debounce: 40, maxWait: 55 },
	);
	const results = [queue.enqueue(operation("a"))];
	await sleep(20);
	results.push(queue.enqueue(operation("b")));
	await sleep(20);
	results.push(queue.enqueue(operation("c")));
	await sleep(25);
	expect(calls).toHaveLength(1);
	await Promise.all(results);
});

test("splits by count and bytes and serializes in-flight batches", async () => {
	const calls: BatchOperation[][] = [];
	let active = 0;
	const queue = new ActionBatchQueue(async operations => {
		expect(active++).toBe(0);
		calls.push(operations);
		await sleep(1);
		active--;
		return success(operations);
	});
	const pending = Array.from({ length: 55 }, (_, i) => queue.enqueue(operation(String(i))));
	await queue.drain();
	await Promise.all(pending);
	expect(calls.map(call => call.length)).toEqual([50, 5]);
	calls.length = 0;
	const large = [
		queue.enqueue(operation("a", "x".repeat(600000))),
		queue.enqueue(operation("b", "x".repeat(600000))),
	];
	await queue.drain();
	await Promise.all(large);
	expect(calls.map(call => call.length)).toEqual([1, 1]);
});

test("cancels unsent operations, including flushed entries behind an active send", async () => {
	let release!: () => void;
	let calls = 0;
	const queue = new ActionBatchQueue(async operations => {
		calls++;
		await new Promise<void>(resolve => {
			release = resolve;
		});
		return success(operations);
	});
	const first = queue.enqueue(operation("a")).catch(error => error.message);
	queue.flush();
	await sleep(0);
	const next = queue.enqueue(operation("b")).catch(error => error.message);
	queue.flush();
	queue.cancel(new Error("session changed"));
	release();
	await queue.drain();
	expect(await first).toBe("session changed");
	expect(await next).toBe("session changed");
	expect(calls).toBe(1);
});

test("aborts before send and never retries transport errors or incomplete results", async () => {
	let calls = 0;
	const queue = new ActionBatchQueue(async () => {
		calls++;
		throw new Error("uncertain");
	});
	const controller = new AbortController();
	const cancelled = queue.enqueue(operation("a"), controller.signal).catch(() => "aborted");
	controller.abort();
	await queue.drain();
	expect(await cancelled).toBe("aborted");
	expect(calls).toBe(0);
	const failed = queue.enqueue(operation("b")).catch(error => error.message);
	await queue.drain();
	expect(await failed).toBe("uncertain");
	expect(calls).toBe(1);
	const invalid = new ActionBatchQueue(async () => []);
	const missing = invalid.enqueue(operation("c")).catch(error => error.message);
	await invalid.drain();
	expect(await missing).toContain("incompleta");
});

test("conflict scopes cover imports and records without blocking unrelated rows", async () => {
	const queue = new ActionBatchQueue(async operations => success(operations));
	const pending = queue.enqueue({
		id: "a",
		method: "POST",
		path: "/transaction-imports/import/items/a/approve",
	});
	expect(queue.hasConflict("/transaction-imports/import/approve")).toBe(true);
	expect(queue.hasConflict("/transaction-imports/import")).toBe(true);
	expect(queue.hasConflict("/transaction-imports/import/items/a")).toBe(true);
	expect(queue.hasConflict("/transaction-imports/import/items/b")).toBe(false);
	expect(queue.hasConflict("/transaction-imports/another/approve")).toBe(false);
	expect(queue.hasConflict("/categories")).toBe(false);
	await queue.drain();
	await pending;
	expect(queue.hasConflict("/transaction-imports/import/approve")).toBe(false);
});

test("coalesces duplicate pending writes to one record while preserving distinct records", async () => {
	const calls: BatchOperation[][] = [];
	const queue = new ActionBatchQueue(async operations => {
		calls.push(operations);
		return success(operations);
	});
	const first = queue.enqueue(operation("a"));
	const duplicate = queue.enqueue({ ...operation("a"), id: "duplicate" });
	const other = queue.enqueue(operation("b"));
	expect(first).toBe(duplicate);
	await queue.drain();
	await Promise.all([first, duplicate, other]);
	expect(calls[0]?.map(item => item.path)).toEqual(["/transactions/a", "/transactions/b"]);
	const again = queue.enqueue(operation("a"));
	await queue.drain();
	await again;
	expect(calls).toHaveLength(2);
});
