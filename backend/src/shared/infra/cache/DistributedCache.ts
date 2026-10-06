import { getQueryMetrics, measureOperation } from "sql";
import type { CacheGuard, CachePort } from "~/shared/application/ports";
import { HttpException } from "~/shared/errors";
import { cacheKey } from "../service-namespace";
import { RedisBudget, RedisUnavailableError } from "./RedisBudget";

export const cacheNamespaces = [
	"accounts:detail",
	"accounts:list",
	"accounts:rate-history",
	"accounts:yields",
	"categories:detail",
	"categories:list",
	"credit-cards:overview",
	"credit-cards:statements",
	"dashboard",
	"debts:invitations",
	"debts:events",
	"debts:overview",
	"imports:pending",
	"imports:detail",
	"loans:list",
	"loans:detail",
	"loans:history",
	"loans:installments",
	"schedules:detail",
	"schedules:history",
	"schedules:overview",
	"stores:list",
	"transactions:list",
	"transactions:detail",
] as const;
export type CacheNamespace =
	| (typeof cacheNamespaces)[number]
	| `credit-cards:${string}:statements`
	| `imports:detail:${string}`
	| `transactions:detail:${string}`;

interface CacheEntry<Value> {
	etag: string;
	value: Value;
}
const localCoalescing = new Map<string, Promise<unknown>>();
const LOCK_LEASE_MS = 10_000;
const LOCK_WAIT_MS = 30_000;

const logCacheOperation = (namespace: CacheNamespace, result: "bypass" | "hit" | "miss", startedAt: number) =>
	console.info(
		JSON.stringify({
			durationMs: Number((performance.now() - startedAt).toFixed(2)),
			namespace,
			requestId: getQueryMetrics()?.requestId,
			result,
			type: "cache_operation",
		}),
	);

const stableValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => [key, stableValue(item)]),
		);
	return value;
};
const hash = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");

export class DistributedCache {
	private available = true;
	private readonly budget = new RedisBudget();
	private bypassReason: string | undefined;
	constructor(private readonly cache: CachePort) {}
	private async safely<Result>(operation: () => Promise<Result>): Promise<Result | undefined> {
		try {
			const result = await this.budget.run(operation);
			if (!this.available) {
				this.available = true;
				await this.budget.run(() => this.cache.increment(cacheKey("cache:epoch")));
				return await this.budget.run(operation);
			}
			return result;
		} catch (error) {
			this.bypassReason = error instanceof RedisUnavailableError ? error.reason : "unavailable";
			const metrics = getQueryMetrics();
			if (metrics && metrics.spans.length < 256)
				metrics.spans.push({
					durationMs: 0,
					name: `cache:${this.bypassReason}`,
					outcome: "error",
					startMs: performance.now() - metrics.startedAt,
				});
			this.available = false;
			return undefined;
		}
	}
	private async getEpoch() {
		const current = await this.safely(() => this.cache.get(cacheKey("cache:epoch")));
		if (current) {
			return current;
		}
		await this.safely(() => this.cache.set(cacheKey("cache:epoch"), "1", { onlyIfAbsent: true }));
		const created = await this.safely(() => this.cache.get(cacheKey("cache:epoch")));
		const epoch = created ?? crypto.randomUUID();
		return epoch;
	}
	private generationKey(userId: string, namespace: CacheNamespace) {
		return cacheKey(`generation:${userId}:${namespace}`);
	}
	private fenceKey(userId: string, namespace: CacheNamespace) {
		return cacheKey(`fence:${userId}:${namespace}`);
	}
	private dependencies(namespace: CacheNamespace): CacheNamespace[] {
		if (namespace.startsWith("transactions:detail:")) return ["transactions:detail", namespace];
		if (namespace.startsWith("imports:detail:")) return ["imports:detail", namespace];
		if (namespace.startsWith("credit-cards:") && namespace.endsWith(":statements"))
			return namespace === "credit-cards:statements" ? [namespace] : ["credit-cards:statements", namespace];
		return [namespace];
	}
	private async fenced(userId: string, namespace: CacheNamespace) {
		const fences = await Promise.all(
			this.dependencies(namespace).map(dependency =>
				this.safely(() => this.cache.hasFence(this.fenceKey(userId, dependency))),
			),
		);
		return fences.some(fence => fence !== false);
	}
	private async snapshot(userId: string, namespace: CacheNamespace, parameters: unknown) {
		const dependencies = this.dependencies(namespace);
		const state = this.cache.readState
			? await this.safely(() =>
					this.cache.readState!(
						cacheKey("cache:epoch"),
						dependencies.map(dependency => ({
							fenceKey: this.fenceKey(userId, dependency),
							generationKey: this.generationKey(userId, dependency),
						})),
					),
				)
			: undefined;
		const fallbackFenced = this.cache.readState ? false : await this.fenced(userId, namespace);
		const [epoch, generation, fenced] = this.cache.readState
			? ([
					state?.epoch ?? crypto.randomUUID(),
					state?.generations ?? dependencies.map(() => "0"),
					state?.fenced ?? true,
				] as const)
			: await Promise.all([
					this.getEpoch(),
					Promise.all(
						dependencies.map(dependency =>
							this.safely(() => this.cache.get(this.generationKey(userId, dependency))),
						),
					),
					Promise.resolve(fallbackFenced),
				]);

		const guards: CacheGuard[] = [
			{ generation: epoch, generationKey: cacheKey("cache:epoch") },
			...dependencies.map((dependency, index) => ({
				fenceKey: this.fenceKey(userId, dependency),
				generation: generation[index] ?? "0",
				generationKey: this.generationKey(userId, dependency),
			})),
		];
		return {
			fenced,
			guards,
			key: cacheKey(
				`v2:${epoch}:${userId}:${namespace}:${generation.map(value => value ?? "0").join(".")}:${hash(JSON.stringify(stableValue(parameters)))}`,
			),
		};
	}
	async key(userId: string, namespace: CacheNamespace, parameters: unknown) {
		return (await this.snapshot(userId, namespace, parameters)).key;
	}
	async read<Value>(
		userId: string,
		namespace: CacheNamespace,
		parameters: unknown,
	): Promise<CacheEntry<Value> | undefined> {
		const { key, guards, fenced } = await this.snapshot(userId, namespace, parameters);
		if (fenced) return undefined;
		const raw = await this.safely(() => this.cache.getRegistered(key, guards));
		if (!raw) return undefined;
		try {
			return JSON.parse(raw) as CacheEntry<Value>;
		} catch {
			return undefined;
		}
	}
	async remember<Value>(
		userId: string,
		namespace: CacheNamespace,
		parameters: unknown,
		load: () => Promise<Value>,
	) {
		const startedAt = performance.now();
		const { key, guards, fenced } = await this.snapshot(userId, namespace, parameters);
		const raw = fenced ? undefined : await this.safely(() => this.cache.getRegistered(key, guards));
		if (raw) {
			try {
				const cached = JSON.parse(raw) as CacheEntry<Value>;
				logCacheOperation(namespace, "hit", startedAt);
				return { ...cached, hit: true as const };
			} catch {
				/* Invalid entries are replaced by the guarded loader. */
			}
		}
		if (fenced) {
			const value = await measureOperation("loader", load);
			logCacheOperation(namespace, "bypass", startedAt);
			return { etag: `"${hash(JSON.stringify(value))}"`, hit: false as const, value };
		}
		const existing = localCoalescing.get(key) as Promise<CacheEntry<Value>> | undefined;
		if (existing) {
			const entry = await existing;
			logCacheOperation(namespace, "miss", startedAt);
			return { ...entry, hit: false as const };
		}
		const lockKey = `${key}:lock`;
		const lockOwner = crypto.randomUUID();
		const lockResult = await this.safely(() =>
			this.cache.set(lockKey, lockOwner, { onlyIfAbsent: true, ttlMs: LOCK_LEASE_MS }),
		);
		const ownsLock = lockResult === true;
		if (lockResult === false) {
			const deadline = performance.now() + LOCK_WAIT_MS;
			let pollMs = 25;
			while (performance.now() < deadline) {
				await Bun.sleep(pollMs);
				pollMs = Math.min(500, pollMs * 2);
				const filled = await this.read<Value>(userId, namespace, parameters);
				if (!this.available)
					throw new HttpException("Cache temporariamente indisponível. Tente novamente.", 503);
				if (filled) {
					logCacheOperation(namespace, "hit", startedAt);
					return { ...filled, hit: true as const };
				}
			}
			throw new HttpException("Leitura em processamento. Tente novamente.", 503);
		}
		let leaseValid = ownsLock;
		let renewing = Promise.resolve();
		const renewal = ownsLock
			? setInterval(() => {
					renewing = this.safely(() => this.cache.renewLock(lockKey, lockOwner, LOCK_LEASE_MS)).then(
						valid => {
							leaseValid = leaseValid && valid === true;
						},
					);
				}, LOCK_LEASE_MS / 3)
			: undefined;
		const pending = (async () => {
			const value = await measureOperation("loader", load);
			const encoded = JSON.stringify(value);
			const entry = { etag: `"${hash(encoded)}"`, value };
			if (leaseValid) await this.safely(() => this.cache.setRegistered(key, JSON.stringify(entry), guards));
			return entry;
		})();
		localCoalescing.set(key, pending);
		try {
			const entry = await pending;
			logCacheOperation(namespace, this.available ? "miss" : "bypass", startedAt);
			return { ...entry, hit: false as const };
		} finally {
			if (renewal) clearInterval(renewal);
			await renewing;
			localCoalescing.delete(key);
			if (ownsLock) await this.safely(() => this.cache.releaseLock(lockKey, lockOwner));
		}
	}
	async beginWrite(
		userId: string,
		namespaces: readonly CacheNamespace[],
		token: string = crypto.randomUUID(),
	) {
		await Promise.all(
			namespaces.map(namespace =>
				this.safely(() => this.cache.beginFence(this.fenceKey(userId, namespace), token, 120_000)),
			),
		);
		return token;
	}
	async finishWrite(userId: string, namespaces: readonly CacheNamespace[], token?: string) {
		await Promise.all(
			namespaces.map(namespace =>
				this.safely(() =>
					this.cache.finishFence(
						this.generationKey(userId, namespace),
						this.fenceKey(userId, namespace),
						token,
					),
				),
			),
		);
	}
}
