import type { CachePort } from "~/shared/application/ports";

export const cacheNamespaces = [
	"accounts:list",
	"credit-cards:overview",
	"dashboard",
	"imports:pending",
	"transactions:list",
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
	private epoch?: string;
	constructor(private readonly cache: CachePort) {}
	private async safely<Result>(operation: () => Promise<Result>): Promise<Result | undefined> {
		try {
			const result = await operation();
			if (!this.available) {
				this.available = true;
				await this.cache.increment("zaimu:cache:epoch");
				this.epoch = undefined;
			}
			return result;
		} catch {
			this.available = false;
			return undefined;
		}
	}
	private async getEpoch() {
		if (this.epoch) return this.epoch;
		const current = await this.safely(() => this.cache.get("zaimu:cache:epoch"));
		if (current) {
			this.epoch = current;
			return current;
		}
		const created = await this.safely(() => this.cache.increment("zaimu:cache:epoch"));
		const epoch = String(created ?? crypto.randomUUID());
		this.epoch = epoch;
		return epoch;
	}
	private generationKey(userId: string, namespace: CacheNamespace) {
		return `zaimu:generation:${userId}:${namespace}`;
	}
	private fenceKey(userId: string, namespace: CacheNamespace) {
		return `zaimu:fence:${userId}:${namespace}`;
	}
	async key(userId: string, namespace: CacheNamespace, parameters: unknown) {
		const [epoch, generation] = await Promise.all([
			this.getEpoch(),
			this.safely(() => this.cache.get(this.generationKey(userId, namespace))),
		]);
		return `zaimu:v1:${epoch}:${userId}:${namespace}:${generation ?? "0"}:${hash(JSON.stringify(stableValue(parameters)))}`;
	}
	async read<Value>(
		userId: string,
		namespace: CacheNamespace,
		parameters: unknown,
	): Promise<CacheEntry<Value> | undefined> {
		if ((await this.safely(() => this.cache.get(this.fenceKey(userId, namespace)))) !== null)
			return undefined;
		const raw = await this.safely(async () => this.cache.get(await this.key(userId, namespace, parameters)));
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
		const cached = await this.read<Value>(userId, namespace, parameters);
		if (cached) return { ...cached, hit: true as const };
		const key = await this.key(userId, namespace, parameters);
		const existing = localCoalescing.get(key) as Promise<CacheEntry<Value>> | undefined;
		if (existing) return { ...(await existing), hit: false as const };
		const pending = (async () => {
			const value = await load();
			const encoded = JSON.stringify(value);
			const entry = { etag: `"${hash(encoded)}"`, value };
			if ((await this.safely(() => this.cache.get(this.fenceKey(userId, namespace)))) === null)
				await this.safely(() => this.cache.set(key, JSON.stringify(entry)));
			return entry;
		})();
		localCoalescing.set(key, pending);
		try {
			return { ...(await pending), hit: false as const };
		} finally {
			localCoalescing.delete(key);
		}
	}
	async beginWrite(userId: string, namespaces: CacheNamespace[]) {
		await Promise.all(
			namespaces.map(namespace =>
				this.safely(() => this.cache.set(this.fenceKey(userId, namespace), "1", { ttlMs: 30_000 })),
			),
		);
	}
	async finishWrite(userId: string, namespaces: CacheNamespace[]) {
		await Promise.all(
			namespaces.map(async namespace => {
				await this.safely(() => this.cache.increment(this.generationKey(userId, namespace)));
				await this.safely(() => this.cache.delete(this.fenceKey(userId, namespace)));
			}),
		);
	}
}
