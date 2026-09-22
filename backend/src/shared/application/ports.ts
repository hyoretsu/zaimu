import type { EventEnvelope } from "./events";

export interface CachePort {
	delete(key: string): Promise<void>;
	get(key: string): Promise<string | null>;
	increment(key: string): Promise<number>;
	set(key: string, value: string, options?: { onlyIfAbsent?: boolean; ttlMs?: number }): Promise<boolean>;
}

export interface EventBrokerPort {
	close(): Promise<void>;
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
