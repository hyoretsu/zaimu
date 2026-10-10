import { describe, expect, test } from "bun:test";
import Elysia from "elysia";
import { UpgradeDebtBody } from "./debt-upgrade";

const original = {
	amount: 500,
	createdAt: "2026-08-25T22:36:39.860Z",
	date: "2026-04-08T00:00:00.000Z",
	description: "iPhone X",
	id: "53d84156-a4a1-4f52-9ca4-841d32238536",
	isOwedToMe: true,
	isPaid: false,
	personName: "Lucas Dantas",
	updatedAt: "2026-09-05T19:04:05.361Z",
	userId: "wUidTPFXMLoLIVdf9XD01a7huKuyzzUT",
};

const app = new Elysia().post("/upgrades/debt-origins", () => ({ accepted: true }), {
	body: UpgradeDebtBody,
});

function register(dates: Record<string, unknown>) {
	return app.handle(
		new Request("http://localhost/upgrades/debt-origins", {
			body: JSON.stringify({
				records: [
					{
						debtPersonId: original.id,
						original: { ...original, ...dates },
						originId: original.id,
						settlementId: null,
					},
				],
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		}),
	);
}

describe("legacy debt upgrade request validation", () => {
	test.each([
		{ dueDate: null, paidDate: null },
		{},
		{ dueDate: "2026-04-09T00:00:00.000Z", paidDate: "2026-04-10T00:00:00.000Z" },
	])("accepts nullable, omitted and string dates: %j", async dates => {
		const response = await register(dates);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ accepted: true });
	});

	test.each(["dueDate", "paidDate"])("rejects non-string %s", async field => {
		expect((await register({ [field]: 123 })).status).toBe(422);
	});
});
