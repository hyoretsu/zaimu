import { expect, test } from "bun:test";
import Elysia from "elysia";
import { SyncDebtEvent } from "./SyncDTO";

test("sync accepts legacy debt events and retains explicit native currency", async () => {
	const app = new Elysia().post("/event", ({ body }) => body, { body: SyncDebtEvent });
	const event = {
		amount: 1.001,
		createdAt: "2026-10-01T00:00:00Z",
		date: null,
		debtPersonId: "person",
		effect: 1.001,
		id: "event",
		kind: "ORIGIN",
		updatedAt: "2026-10-01T00:00:00Z",
	};
	async function send(body: unknown) {
		return app.handle(
			new Request("http://localhost/event", {
				body: JSON.stringify(body),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);
	}
	const native = await send({ ...event, currency: "KWD" });
	expect(native.status).toBe(200);
	expect(await native.json()).toMatchObject({ amount: 1.001, currency: "KWD" });
	expect((await send(event)).status).toBe(200);
	expect((await send({ ...event, currency: "kwd" })).status).toBe(422);
});
