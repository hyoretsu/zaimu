import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { closeDatabase } from "sql";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { getInvitationPreview, getPersonEventPage } from "../infra/elysia/DebtsController";

const url = requireFixtureUrl("DATABASE_TEST_URL");
const preview = { connectionId: null, id: "person", invitationId: "connection" } as const;

const seed = async (client: Client) => {
	// Foreign keys are irrelevant to the read path; skip the unrelated credit-card/statement graph.
	await client.query("SET session_replication_role = replica");
	await client.query(
		`INSERT INTO "user" ("id","email","name","role") VALUES ('a','a@test.invalid','Alice','USER'),('b','b@test.invalid','Bob','USER')`,
	);
	await client.query(
		`INSERT INTO "DebtConnection" ("id","requesterId","recipientId","status") VALUES ('connection','a','b','ACCEPTED')`,
	);
	await client.query(
		`INSERT INTO "DebtPerson" ("id","userId","name","normalizedName","connectionId","hiddenAt") VALUES
		 ('a-hidden','a','Hidden','hidden','connection', now()),
		 ('person','a','Bob','bob','connection', NULL)`,
	);
	await client.query(
		`INSERT INTO "Transaction" ("id","userId","amount","date","type","description","time") VALUES
		 ('tx-expense','a',10,'2026-03-03','EXPENSE','Transaction description','10:00:00'),
		 ('tx-income','a',10,'2026-03-02','INCOME','Salary','11:00:00')`,
	);
	await client.query(
		`INSERT INTO "CreditPurchaseRecord" ("id","creditCardId","userId","description","storeName","purchaseDate","totalAmount","time")
		 VALUES ('purchase','card','a','Purchase description','Store','2026-03-02',10,'12:00:00')`,
	);
	await client.query(
		`INSERT INTO "CreditRefundRecord" ("id","purchaseId","statementId","amount","creditDate","policy","time")
		 VALUES ('refund','purchase','statement',10,'2026-03-01','KEEP_INSTALLMENTS','13:00:00')`,
	);
	await client.query(
		`INSERT INTO "CreditEntryReference" ("id","purchaseId","refundId") VALUES ('ref-purchase','purchase',NULL),('ref-refund',NULL,'refund')`,
	);
	await client.query(
		`INSERT INTO "DebtSplit" ("id","userId","mode","creditPurchaseId") VALUES ('split','a','SHARES','purchase')`,
	);
	await client.query(
		`INSERT INTO "DebtSplitParticipant" ("id","debtSplitId","debtPersonId","sortOrder","description")
		 VALUES ('participant','split','person',0,'Participant description')`,
	);
	await client.query(
		`INSERT INTO "DebtEvent" ("id","debtPersonId","connectionId","createdByUserId","kind","amount","effect","date","description","deletedAt") VALUES
		 ('e1','person','connection','a','TRANSACTION',100,100,'2026-03-03','Event description',NULL),
		 ('e2','person','connection','a','TRANSACTION',10,10,'2026-03-02','ignored for income',NULL),
		 ('e3','person','connection','a','PURCHASE',20,20,'2026-03-02','ignored for purchase',NULL),
		 ('e4','person','connection','a','PURCHASE',30,30,'2026-03-01','Refund event',NULL),
		 ('e5','person','connection','a','ORIGIN',40,40,NULL,'',NULL),
		 ('e6','person','connection','b','ORIGIN',5,5,'2026-03-03','From Bob',NULL),
		 ('e7','person','connection','a','ORIGIN',99,99,'2026-03-05','deleted',now()),
		 ('e-hidden','a-hidden','connection','a','ORIGIN',77,77,'2026-03-04','hidden person',NULL)`,
	);
	await client.query(
		`INSERT INTO "DebtTransactionLink" ("id","eventId","userId","transactionId","isCreator") VALUES
		 ('l1','e1','a','tx-expense',true),('l2','e2','a','tx-income',true)`,
	);
	await client.query(
		`INSERT INTO "DebtPurchaseLink" ("id","eventId","userId","creditPurchaseId","isCreator") VALUES
		 ('l3','e3','a','ref-purchase',true),('l4','e4','a','ref-refund',true)`,
	);
};

describe("debt event page and invitation summary", () => {
	beforeAll(async () => {
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await installContractFixture(client, contract);
			await seed(client);
		} finally {
			await client.end();
		}
	});
	afterAll(() => closeDatabase());

	test("resolves description, time and viewer-relative effect per event", async () => {
		const page = await getPersonEventPage("b", "person", undefined, 50, preview);
		expect(page.items.map(item => item.id)).toEqual(["e6", "e1", "e3", "e2", "e4", "e5"]);
		const byId = Object.fromEntries(page.items.map(item => [item.id, item]));
		expect(byId.e1).toMatchObject({ description: "Event description", effect: -100, time: "10:00:00" });
		expect(byId.e2).toMatchObject({ description: "Salary", effect: -10, time: "11:00:00" });
		expect(byId.e3).toMatchObject({
			description: "Participant description",
			effect: -20,
			time: "12:00:00",
		});
		expect(byId.e4).toMatchObject({ description: "Refund event", effect: -30, time: "13:00:00" });
		expect(byId.e5).toMatchObject({ date: null, description: null, effect: -40, time: null });
		expect(byId.e6).toMatchObject({ createdByMe: true, createdByName: "Bob", effect: 5 });
		expect(byId.e1?.date).toEqual(new Date("2026-03-03T00:00:00.000Z"));
		expect(page.hasMore).toBe(false);
		const owner = await getPersonEventPage("a", "person", undefined, 50, preview);
		expect(owner.items.find(item => item.id === "e1")?.effect).toBe(100);
		expect(owner.items.find(item => item.id === "e6")?.effect).toBe(-5);
	});

	test("paginates with stable date desc, id desc ordering and null dates last", async () => {
		const seen: string[] = [];
		let cursor: string | undefined;
		do {
			const page = await getPersonEventPage("b", "person", cursor, 2, preview);
			expect(page.items.length).toBeLessThanOrEqual(2);
			seen.push(...page.items.map(item => item.id));
			cursor = page.nextCursor ?? undefined;
		} while (cursor);
		expect(seen).toEqual(["e6", "e1", "e3", "e2", "e4", "e5"]);
	});

	test("invitation summary ignores hidden people and deleted events, with viewer-relative balances", async () => {
		const summary = await getInvitationPreview("connection", "a", "b", undefined, 50);
		expect(summary.eventCount).toBe(6);
		expect(summary.balance).toBe(-100 - 10 - 20 - 30 - 40 + 5);
		expect(summary.balances).toEqual([{ amount: -195, currency: "BRL" }]);
		expect(summary.items.map(item => item.id)).toEqual(["e6", "e1", "e3", "e2", "e4", "e5"]);
		const creator = await getInvitationPreview("connection", "a", "a", undefined, 50);
		expect(creator.balance).toBe(100 + 10 + 20 + 30 + 40 - 5);
		expect(await getInvitationPreview("connection", "nobody", "b")).toMatchObject({
			eventCount: 0,
			items: [],
		});
	});
});
