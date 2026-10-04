import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { RedisClient } from "bun";
import { withoutQueryMetrics } from "sql";
import { HttpException } from "~/shared/errors";
import { RedisBudget } from "~/shared/infra/cache/RedisBudget";
import { cacheKey } from "~/shared/infra/service-namespace";

interface StorageContext {
	generation?: string;
	blocked?: boolean;
	hit?: boolean;
}
const contexts = new AsyncLocalStorage<StorageContext>();
const generationKey = () => cacheKey("auth:epoch");
const fenceKey = () => cacheKey("auth:fences");
const ENTRY_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Shared cache. PostgreSQL stays authoritative whenever cache consistency cannot be established. */
export class AuthSecondaryStorage {
	private readonly budget = new RedisBudget();
	private recovering = false;
	private readonly completedFences = new Set<string>();
	private cleanupTimer: ReturnType<typeof setTimeout> | undefined;
	private readonly cleanupBudget = new RedisBudget();
	readonly client: RedisClient;
	constructor(url = process.env.REDIS_URL) {
		this.client = new RedisClient(url, { autoReconnect: true, connectionTimeout: 100 });
	}
	private key(key: string) {
		const secret = process.env.BETTER_AUTH_SECRET;
		if (!secret) throw new Error("BETTER_AUTH_SECRET required for auth cache key protection");
		return cacheKey(`auth:entry:${createHmac("sha256", secret).update(key).digest("hex")}`);
	}
	private async safely<Result>(operation: () => Promise<Result>) {
		try {
			if (this.recovering) {
				await this.budget.run(() => this.client.send("INCR", [generationKey()]));
				this.recovering = false;
			}
			return await this.budget.run(operation);
		} catch {
			this.recovering = true;
			const context = contexts.getStore();
			if (context) context.blocked = true;
			return undefined;
		}
	}
	run<Result>(operation: () => Result) {
		return contexts.run({}, operation);
	}
	async get(key: string): Promise<string | null> {
		const context = contexts.getStore();
		const result = (await this.safely(() =>
			this.client.send("EVAL", [
				`local now=redis.call('TIME'); now=now[1]*1000+math.floor(now[2]/1000);
    
    local epoch=redis.call('GET',KEYS[1]) or '0';
    if redis.call('ZCARD',KEYS[2])>0 then return {epoch,'',1} end;
    local raw=redis.call('GET',KEYS[3]); if not raw then return {epoch,'',0} end;
    local data=cjson.decode(raw); if data.epoch~=epoch then return {epoch,'',0} end;
    return {epoch,data.value,0}`,
				"3",
				generationKey(),
				fenceKey(),
				this.key(key),
			]),
		)) as [string, string, number] | undefined;
		if (!result) return null;
		if (context) {
			context.generation ??= result[0];
			context.blocked ||= result[2] === 1;
			context.hit ||= Boolean(result[1]);
		}
		return result[1] || null;
	}
	async set(key: string, value: string, ttl = ENTRY_TTL_SECONDS): Promise<void> {
		const context = contexts.getStore();
		if (context?.blocked) return;
		// Reads/fallbacks reuse the generation from before their DB read. Concurrent revocation wins.
		if (context?.generation === undefined) await this.get(key);
		const generation = context?.generation;
		if (generation === undefined || context?.blocked) return;
		await this.safely(() =>
			this.client.send("EVAL", [
				`local now=redis.call('TIME'); now=now[1]*1000+math.floor(now[2]/1000);
    
    if (redis.call('GET',KEYS[1]) or '0')~=ARGV[1] or redis.call('ZCARD',KEYS[2])>0 then return 0 end;
    redis.call('SET',KEYS[3],ARGV[2],'EX',ARGV[3]); return 1`,
				"3",
				generationKey(),
				fenceKey(),
				this.key(key),
				generation,
				JSON.stringify({ epoch: generation, value }),
				String(Math.max(1, Math.ceil(ttl))),
			]),
		);
	}
	async delete(key: string): Promise<void> {
		await this.safely(() => this.client.send("DEL", [this.key(key)]));
	}
	async mirror(value: { session: { token: string; expiresAt: Date }; user: unknown } | null) {
		if (!value || contexts.getStore()?.hit) return;
		const ttl = Math.floor((value.session.expiresAt.getTime() - Date.now()) / 1000);
		if (ttl > 0) await this.set(value.session.token, JSON.stringify(value), ttl);
	}
	async getAndDelete(key: string): Promise<string | null> {
		const result = await this.safely(() =>
			this.client.send("EVAL", [
				`local epoch=redis.call('GET',KEYS[1]) or '0';
    if redis.call('ZCARD',KEYS[2])>0 then return '' end;
    local raw=redis.call('GETDEL',KEYS[3]); if not raw then return '' end;
    local data=cjson.decode(raw); if data.epoch~=epoch then return '' end;
    return data.value`,
				"3",
				generationKey(),
				fenceKey(),
				this.key(key),
			]),
		);
		return typeof result === "string" && result ? result : null;
	}
	increment = async (key: string, ttl: number): Promise<number> => {
		const result = await this.safely(() =>
			this.client.send("EVAL", [
				"local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return count",
				"1",
				this.key(`counter:${key}`),
				String(Math.max(1, Math.ceil(ttl))),
			]),
		);
		if (typeof result !== "number")
			throw new HttpException("Autenticação temporariamente indisponível. Tente novamente.", 503);
		return result;
	};
	private releaseFence(token: string) {
		return this.client.send("EVAL", [
			"redis.call('INCR',KEYS[1]); redis.call('ZREM',KEYS[2],ARGV[1]); return 1",
			"2",
			generationKey(),
			fenceKey(),
			token,
		]);
	}
	private retryCompletedFence(token: string) {
		this.completedFences.add(token);
		if (this.cleanupTimer) return;
		this.cleanupTimer = withoutQueryMetrics(() =>
			setTimeout(async () => {
				this.cleanupTimer = undefined;
				for (const completed of this.completedFences) {
					try {
						await this.cleanupBudget.run(() => this.releaseFence(completed));
						this.completedFences.delete(completed);
					} catch {
						break;
					}
				}
				const next = this.completedFences.values().next().value;
				if (next) this.retryCompletedFence(next);
			}, 1000),
		);
		this.cleanupTimer.unref();
	}
	async mutate<Result>(operation: () => Promise<Result>): Promise<Result> {
		const token = crypto.randomUUID();
		// A durable fence prevents stale session reuse after a crash. Only its owner
		// releases it, after the authoritative operation has finished.
		let acquisition: Promise<unknown> | undefined;
		const acquired = await this.safely(() => {
			acquisition = this.client.send("EVAL", [
				"redis.call('INCR',KEYS[1]); redis.call('ZADD',KEYS[2],0,ARGV[1]); return 1",
				"2",
				generationKey(),
				fenceKey(),
				token,
			]);
			return acquisition;
		});
		if (acquired !== 1) {
			// Timed-out Redis commands can finish later. Remove only our completed fence.
			withoutQueryMetrics(() =>
				acquisition?.then(
					() => this.retryCompletedFence(token),
					() => {},
				),
			);
			throw new HttpException("Autenticação temporariamente indisponível. Tente novamente.", 503);
		}
		try {
			return await contexts.run({ blocked: true }, operation);
		} finally {
			if ((await this.safely(() => this.releaseFence(token))) !== 1)
				withoutQueryMetrics(() => this.retryCompletedFence(token));
		}
	}
}
export const authSecondaryStorage = new AuthSecondaryStorage();
