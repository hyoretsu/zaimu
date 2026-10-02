import type { EventEnvelope } from "./events";

export interface CacheGuard {
	generationKey: string;
	generation: string;
	fenceKey?: string;
}

export interface CachePort {
	getRegistered(key: string, guards: CacheGuard[]): Promise<string | null>;
	setRegistered(key: string, value: string, guards: CacheGuard[]): Promise<boolean>;
	beginFence(key: string, token: string, leaseMs: number): Promise<void>;
	hasFence(key: string): Promise<boolean>;
	finishFence(generationKey: string, fenceKey: string, token?: string): Promise<void>;
	delete(key: string): Promise<void>;
	get(key: string): Promise<string | null>;
	increment(key: string): Promise<number>;
	releaseLock(key: string, owner: string): Promise<void>;
	set(key: string, value: string, options?: { onlyIfAbsent?: boolean; ttlMs?: number }): Promise<boolean>;
}

export interface EventBrokerPort {
	close(): Promise<void>;
	consume(queue: string, handler: (event: EventEnvelope) => Promise<void>): Promise<void>;
	publish(
		exchange: "zaimu.commands" | "zaimu.events",
		routingKey: string,
		event: EventEnvelope,
	): Promise<void>;
	start(): Promise<void>;
}

export interface OutboxPort {
	append(event: EventEnvelope): Promise<void>;
	markPublished(eventId: string): Promise<void>;
}
