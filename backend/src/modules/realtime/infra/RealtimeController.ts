import { Elysia, sse } from "elysia";
import { requireUserId } from "~/modules/auth";
import { type RealtimeMessage, userEventBus } from "~/shared/infra/realtime";

const heartbeatMs = 25_000;

export const RealtimeController = new Elysia({ prefix: "/realtime" }).get(
	"/stream",
	async function* ({ request }) {
		const userId = await requireUserId(request);
		const queue: RealtimeMessage[] = [];
		let wake: (() => void) | undefined;
		const unsubscribe = await userEventBus.subscribe(userId, message => {
			queue.push(message);
			wake?.();
		});
		try {
			yield sse({ data: {}, event: "ready" });
			while (!request.signal.aborted) {
				if (queue.length === 0)
					await new Promise<void>(resolve => {
						const timer = setTimeout(resolve, heartbeatMs);
						wake = () => {
							clearTimeout(timer);
							resolve();
						};
						request.signal.addEventListener("abort", wake, { once: true });
					});
				wake = undefined;
				const messages = queue.splice(0);
				if (messages.length === 0) yield sse({ data: {}, event: "ping" });
				for (const message of messages) yield sse({ data: message, event: "domain" });
			}
		} finally {
			unsubscribe();
		}
	},
	{ detail: { hide: true } },
);
