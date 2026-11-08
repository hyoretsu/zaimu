import { RedisClient } from "bun";
import { cacheKey } from "../service-namespace";

export interface RealtimeMessage {
	aggregateId?: string;
	aggregateType: string;
	eventType: string;
}

type Listener = (message: RealtimeMessage) => void;

const channel = (userId: string) => cacheKey(`realtime:${userId}`);
const connect = () =>
	new RedisClient(process.env.REDIS_URL, { autoReconnect: true, connectionTimeout: 2_000 });

/** Redis pub/sub bridge: the worker publishes finished side effects, API processes stream them to clients. */
export class UserEventBus {
	private publisher?: RedisClient;
	private subscriber?: RedisClient;
	private readonly listeners = new Map<string, Set<Listener>>();

	async publish(userIds: string[], message: RealtimeMessage) {
		this.publisher ??= connect();
		const payload = JSON.stringify(message);
		await Promise.all(userIds.map(userId => this.publisher!.publish(channel(userId), payload)));
	}

	async subscribe(userId: string, listener: Listener) {
		let listeners = this.listeners.get(userId);
		if (!listeners) {
			listeners = new Set();
			this.listeners.set(userId, listeners);
			this.subscriber ??= connect();
			await this.subscriber.subscribe(channel(userId), payload => {
				for (const current of this.listeners.get(userId) ?? [])
					current(JSON.parse(payload) as RealtimeMessage);
			});
		}
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
			if (listeners.size > 0) return;
			this.listeners.delete(userId);
			void this.subscriber?.unsubscribe(channel(userId)).catch(() => undefined);
		};
	}
}

export const userEventBus = new UserEventBus();
