import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import type { Binding } from "../application/candidates";
import { normalizeTransaction } from "../domain/normalize";
import { encryptCredentials } from "../infra/credentials";

const url = requireFixtureUrl("OPEN_FINANCE_TEST_URL");
const originalFetch = globalThis.fetch;
let sql: typeof import("~/shared/infra/sql");
let processRecord: typeof import("../application/process-record").processRecord;
let startSync: typeof import("../application/sync").startSync;
let disconnect: typeof import("../application/configuration").disconnect;
const binding: Binding = {
	connectionId: "connection",
	creditCardId: null,
	financialAccountId: "account",
	id: "binding",
	paused: false,
	remoteAccountId: "remote",
};
const remote = (id = "first", changes = {}) =>
	normalizeTransaction(
		{
			accountId: "remote",
			amount: -100,
			date: "2026-01-15",
			description: "Mercado",
			id,
			providerId: `bank-${id}`,
			...changes,
		},
		false,
	);
async function processRemote(input = remote(), target = binding, userId = "owner") {
	return sql.withRawTransaction(async () => {
		await sql.queryRaw('SELECT "userId" FROM "OpenFinanceConfig" WHERE "userId"=$1 FOR UPDATE', [userId]);
		return processRecord(userId, target, input);
	});
}
describe("MeuPluggy local integration", () => {
	beforeAll(async () => {
		globalThis.fetch = (async () => {
			throw new Error("Unexpected external request in local Open Finance integration");
		}) as unknown as typeof fetch;
		process.env.DATABASE_URL = url;
		process.env.OPEN_FINANCE_ENCRYPTION_KEY = "ab".repeat(32);
		process.env.REDIS_URL = requireFixtureUrl("CACHE_TEST_REDIS_URL");
		sql = await import("~/shared/infra/sql");
		({ processRecord } = await import("../application/process-record"));
		({ startSync } = await import("../application/sync"));
		({ disconnect } = await import("../application/configuration"));
		await sql.executeRaw(`INSERT INTO "user" ("id","email","name") VALUES ('owner','owner@example.test','Owner'),('other','other@example.test','Other');
   INSERT INTO "FinancialAccount" ("id","userId","type") VALUES ('account','owner','CHECKING'),('other-account','other','CHECKING');
   INSERT INTO "OpenFinanceConfig" ("userId") VALUES ('owner'),('other');
   INSERT INTO "OpenFinanceConnection" ("id","userId","itemId","bankName","status","remoteAccounts") VALUES ('connection','owner','item','Bank','UPDATED','[]');
   INSERT INTO "OpenFinanceBinding" ("id","connectionId","remoteAccountId","financialAccountId") VALUES ('binding','connection','remote','account');`);
		await sql.executeRaw('UPDATE "OpenFinanceConfig" SET "encryptedCredentials"=$1 WHERE "userId"=$2', [
			encryptCredentials("owner", { clientId: "test", clientSecret: "test-secret" }),
			"owner",
		]);
	}, 120000);
	afterAll(async () => {
		globalThis.fetch = originalFetch;
		if (sql) await sql.closeDatabase();
	});
	test("repeated and concurrent deliveries materialize once", async () => {
		expect(await processRemote()).toBe("imported");
		expect(await processRemote()).toBe("unchanged");
		await Promise.all([
			processRemote(remote("concurrent", { date: "2026-01-16" })),
			processRemote(remote("concurrent", { date: "2026-01-16" })),
		]);
		expect(
			(await sql.queryRaw<{ count: number }>('SELECT count(*)::integer AS "count" FROM "Transaction"'))[0]
				.count,
		).toBe(2);
	});
	test("user isolation and reconnection aliases", async () => {
		expect(
			await processRemote(remote("first"), { ...binding, financialAccountId: "other-account" }, "other"),
		).toBe("imported");
		expect(await processRemote(remote("reconnected", { description: " MERCADO " }))).toBe("linked");
		expect(
			(
				await sql.queryRaw<{ count: number }>(
					'SELECT count(*)::integer AS "count" FROM "Transaction" WHERE "userId"=$1',
					["owner"],
				)
			)[0].count,
		).toBe(2);
	});
	test("corrections apply without edits and preserve locally edited records", async () => {
		expect(await processRemote(remote("first", { amount: -120 }))).toBe("imported");
		const [record] = await sql.queryRaw<{ localId: string }>(
			'SELECT "localId" FROM "OpenFinanceRecord" WHERE "userId"=$1 AND "identity"=$2',
			["owner", "provider:bank-first"],
		);
		await sql.executeRaw('UPDATE "Transaction" SET "description"=$2 WHERE "id"=$1', [
			record.localId,
			"Local edit",
		]);
		expect(await processRemote(remote("first", { amount: -120 }))).toBe("unchanged");
		expect(await processRemote(remote("first", { amount: -130 }))).toBe("pending");
		const [local] = await sql.queryRaw<{ description: string; amount: number }>(
			'SELECT "description","amount" FROM "Transaction" WHERE "id"=$1',
			[record.localId],
		);
		expect(local.description).toBe("Local edit");
		expect(local.amount).toBe(120);
		expect(await processRemote(remote("first", { amount: -130 }))).toBe("unchanged");
	});
	test("PDF pending exact matches link and multiple candidates stay in review", async () => {
		await sql.executeRaw(`INSERT INTO "TransactionImport" ("id","userId","financialAccountId","provider","fileName") VALUES ('pdf','owner','account','NUBANK','PDF');
   INSERT INTO "TransactionImportItem" ("id","transactionImportId","amount","date","description","type","originFinancialAccountId") VALUES ('pdf-item','pdf',45,'2026-02-01','PDF market','EXPENSE','account');`);
		expect(
			await processRemote(remote("pdf", { amount: -45, date: "2026-02-01", description: "PDF market" })),
		).toBe("linked");
		await sql.executeRaw(
			`INSERT INTO "Transaction" ("userId","amount","date","description","type","originFinancialAccountId") VALUES ('owner',45,'2026-02-01','PDF market','EXPENSE','account');`,
		);
		expect(
			await processRemote(
				remote("ambiguous", { amount: -45, date: "2026-02-01", description: "PDF market" }),
			),
		).toBe("pending");
	});
	test("pending transactions wait for confirmation and discarded records never reappear", async () => {
		expect(await processRemote(remote("waiting", { date: "2026-03-02", status: "PENDING" }))).toBe("pending");
		expect(await processRemote(remote("waiting", { date: "2026-03-02", status: "POSTED" }))).toBe("imported");
		const { settleExternalReview } = await import("../application/review-tracking");
		const [review] = await sql.queryRaw<{ reviewItemId: string }>(
			'SELECT "reviewItemId" FROM "OpenFinanceRecord" WHERE "identity"=$1',
			["provider:bank-ambiguous"],
		);
		await settleExternalReview(review.reviewItemId);
		expect(
			await processRemote(
				remote("ambiguous", { amount: -45, date: "2026-02-01", description: "PDF market" }),
			),
		).toBe("unchanged");
	});
	test("persistent user lock coalesces starts and respects interval", async () => {
		const starts = await Promise.all([startSync("owner", true), startSync("owner", true)]);
		expect(starts[0].runId).toBe(starts[1].runId);
		expect(starts[0].runId).not.toBeNull();
		await sql.executeRaw(`UPDATE "OpenFinanceRun" SET "status"='COMPLETED' WHERE "id"=$1`, [starts[0].runId]);
		expect((await startSync("owner")).runId).toBeNull();
	});
	test("successive card installments share a purchase and retain imported amounts", async () => {
		await sql.executeRaw(`INSERT INTO "FinancialAccount" ("id","userId","type") VALUES ('card-account','owner','CREDIT_CARD');
   INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","dueDay","statementDay") VALUES ('card','card-account',1000,10,1);`);
		const cardBinding = {
			...binding,
			creditCardId: "card",
			financialAccountId: null,
			remoteAccountId: "remote-card",
		};
		const purchase = (number: number) =>
			normalizeTransaction(
				{
					accountId: "remote-card",
					amount: 50,
					creditCardMetadata: {
						billId: `bill-${number}`,
						installmentNumber: number,
						purchaseDate: "2026-01-15",
						totalAmount: 100,
						totalInstallments: 2,
					},
					date: "2026-01-15",
					description: "Parcelada",
					id: `installment-${number}`,
					providerId: `bank-installment-${number}`,
				},
				true,
				[{ closingDate: `2026-0${number + 1}-01`, dueDate: `2026-0${number + 1}-10`, id: `bill-${number}` }],
			);
		expect(await processRemote(purchase(1), cardBinding)).toBe("imported");
		expect(await processRemote(purchase(2), cardBinding)).toBe("linked");
		expect(await processRemote(purchase(2), cardBinding)).toBe("unchanged");
		expect(
			await processRemote(
				{ ...purchase(2), dueDate: "2026-04-10", statementDate: "2026-04-01" },
				cardBinding,
			),
		).toBe("imported");
		const [calendar] = await sql.queryRaw<{ dueDate: string }>(
			`SELECT s."dueDate"::text FROM "CreditInstallmentRecord" i JOIN "CreditCardStatement" s ON s."id"=i."statementId" WHERE i."number"=2`,
		);
		expect(calendar.dueDate).toBe("2026-04-10");
		const purchases = await sql.queryRaw('SELECT * FROM "CreditPurchaseRecord"');
		expect(purchases).toHaveLength(1);
		const installments = await sql.queryRaw<{ amount: number; hasImportedAmount: boolean }>(
			'SELECT "amount","hasImportedAmount" FROM "CreditInstallmentRecord" ORDER BY "number"',
		);
		expect(installments).toEqual([
			{ amount: 50, hasImportedAmount: true },
			{ amount: 50, hasImportedAmount: true },
		]);
		expect(
			await processRemote(
				normalizeTransaction(
					{
						accountId: "remote-card",
						amount: 50,
						creditCardMetadata: { installmentNumber: 1, totalInstallments: 2 },
						date: "2026-01-15",
						description: "Dados incompletos",
						id: "incomplete",
					},
					true,
				),
				cardBinding,
			),
		).toBe("pending");
	});
	test("failed execution resumes confirmed effects without duplication", async () => {
		const input = remote("rollback", { amount: -67, date: "2026-04-01" });
		await expect(
			sql.withRawTransaction(async () => {
				await processRecord("owner", binding, input);
				throw new Error("simulated interruption");
			}),
		).rejects.toThrow("simulated interruption");
		expect(await processRemote(input)).toBe("imported");
		expect(await processRemote(input)).toBe("unchanged");
	});
	test("worker isolates failed connections and resumes expired leases", async () => {
		await sql.executeRaw(
			`INSERT INTO "OpenFinanceConnection" ("id","userId","itemId","bankName","status","remoteAccounts") VALUES ('connection-two','owner','item-two','Second bank','UPDATED','[]'); INSERT INTO "OpenFinanceBinding" ("id","connectionId","remoteAccountId","financialAccountId") VALUES ('binding-two','connection-two','remote-two','account');`,
		);
		const previousFetch = globalThis.fetch;
		let failFirst = true;
		globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
			const target = new URL(String(input));
			if (target.pathname === "/auth") return Response.json({ apiKey: "simulated" });
			if (target.pathname.startsWith("/items/"))
				return Response.json({
					id: target.pathname.split("/").at(-1),
					lastUpdatedAt: "2026-10-03T00:00:00Z",
					status: "UPDATED",
				});
			if (target.pathname === "/accounts") {
				const itemId = target.searchParams.get("itemId")!;
				return Response.json({
					page: 1,
					results: [
						{ id: itemId === "item" ? "remote" : "remote-two", itemId, name: "Bank account", type: "BANK" },
					],
					totalPages: 1,
				});
			}
			if (target.pathname === "/transactions") {
				const accountId = target.searchParams.get("accountId")!;
				if (accountId === "remote" && failFirst) return new Response(null, { status: 429 });
				return Response.json({
					page: 1,
					results: [
						{
							accountId,
							amount: accountId === "remote" ? -21 : -32,
							date: "2026-05-01",
							description: `Worker ${accountId}`,
							id: accountId,
							status: "POSTED",
						},
					],
					totalPages: 1,
				});
			}
			throw new Error("Unexpected outbound request blocked");
		}) as unknown as typeof fetch;
		try {
			const { handleOpenFinanceSync, recoverOpenFinanceRuns, syncStatus } = await import(
				"../application/sync"
			);
			const { createEventEnvelope } = await import("~/shared/application/events");
			const first = await startSync("owner", true);
			const event = (runId: string) =>
				createEventEnvelope({
					aggregateId: runId,
					aggregateType: "openFinance",
					correlationId: runId,
					eventType: "command.open-finance-sync",
					payload: { runId, userId: "owner" },
					userIds: ["owner"],
				});
			await handleOpenFinanceSync(event(first.runId!));
			const result = await syncStatus("owner", first.runId!);
			expect(result.run?.status).toBe("PARTIAL");
			expect(result.run?.imported).toBe(1);
			expect(result.run?.errors[0].message).toContain("Limite de consultas");
			failFirst = false;
			const second = await startSync("owner", true);
			await sql.executeRaw(
				`UPDATE "OpenFinanceRun" SET "status"='RUNNING', "lockedUntil"=now()-interval '1 minute', "workerToken"='abandoned' WHERE "id"=$1`,
				[second.runId],
			);
			await recoverOpenFinanceRuns();
			await handleOpenFinanceSync(event(second.runId!));
			await handleOpenFinanceSync(event(second.runId!));
			expect((await syncStatus("owner", second.runId!)).run?.status).toBe("COMPLETED");
			expect(
				await sql.queryRaw(`SELECT * FROM "Transaction" WHERE "description" LIKE 'Worker %'`),
			).toHaveLength(2);
		} finally {
			globalThis.fetch = previousFetch;
		}
	}, 120000);

	test("bank bill payments require a card and known payments retain their link on correction", async () => {
		const input = remote("bill-payment", {
			date: "2026-06-05",
			description: "Pagamento da fatura",
			operationType: "CREDIT_CARD_PAYMENT",
		});
		expect(await processRemote(input)).toBe("pending");
		const [record] = await sql.queryRaw<{ reviewItemId: string }>(
			`SELECT "reviewItemId" FROM "OpenFinanceRecord" WHERE "identity"='provider:bank-bill-payment'`,
		);
		const [item] = await sql.queryRaw<
			import("../../transaction-imports/application/import-service").ImportItemToApprove &
				Record<string, unknown>
		>(`SELECT * FROM "TransactionImportItem" WHERE "id"=$1`, [record.reviewItemId]);
		const { prepareImportItem } = await import("../../transaction-imports/application/import-service");
		await expect(prepareImportItem(item, "owner")).rejects.toThrow("Selecione o cartão");
		await expect(prepareImportItem({ ...item, paymentCreditCardId: "card" }, "owner")).resolves.toEqual([]);
		await sql.executeRaw(
			`INSERT INTO "Transaction" ("id","userId","amount","date","description","type","originFinancialAccountId","paymentCreditCardId") VALUES ('known-payment','owner',81,'2026-06-06','Pagamento de fatura','EXPENSE','account','card')`,
		);
		const known = remote("known-payment", {
			amount: -81,
			date: "2026-06-06",
			description: "Pagamento de fatura",
			operationType: "CREDIT_CARD_PAYMENT",
		});
		expect(await processRemote(known)).toBe("linked");
		expect(await processRemote({ ...known, amount: -82 })).toBe("imported");
		const [payment] = await sql.queryRaw<{ amount: number; paymentCreditCardId: string }>(
			`SELECT "amount","paymentCreditCardId" FROM "Transaction" WHERE "id"='known-payment'`,
		);
		expect(payment).toEqual({ amount: 82, paymentCreditCardId: "card" });
	});
	test("untouched reviews follow corrections but draft edits are preserved", async () => {
		await sql.executeRaw(
			`INSERT INTO "CurrencyRateSnapshot" ("date","baseCurrency","rates") VALUES ('2026-07-01','USD','{"BRL":5}'),('2026-07-01','BRL','{"USD":0.2}')`,
		);
		const input = remote("review-update", {
			currencyCode: "USD",
			date: "2026-07-01",
			description: "Review change",
		});
		expect(await processRemote(input)).toBe("pending");
		expect(await processRemote({ ...input, amount: -111 })).toBe("unchanged");
		const [record] = await sql.queryRaw<{ reviewItemId: string }>(
			`SELECT "reviewItemId" FROM "OpenFinanceRecord" WHERE "identity"='provider:bank-review-update'`,
		);
		expect(
			(
				await sql.queryRaw<{ amount: number }>(`SELECT "amount" FROM "TransactionImportItem" WHERE "id"=$1`, [
					record.reviewItemId,
				])
			)[0].amount,
		).toBe(555);
		await sql.executeRaw(`UPDATE "TransactionImportItem" SET "description"='Draft edit' WHERE "id"=$1`, [
			record.reviewItemId,
		]);
		await processRemote({ ...input, amount: -112 });
		expect(
			(
				await sql.queryRaw<{ amount: number }>(`SELECT "amount" FROM "TransactionImportItem" WHERE "id"=$1`, [
					record.reviewItemId,
				])
			)[0].amount,
		).toBe(555);
	});
	test("mapping changes preserve history and route corrections to the original destination", async () => {
		const input = remote("mapping-change", { date: "2026-07-02", description: "Mapping change" });
		expect(await processRemote(input)).toBe("imported");
		await sql.executeRaw(
			`INSERT INTO "FinancialAccount" ("id","userId","type") VALUES ('new-destination','owner','CHECKING')`,
		);
		const changed = { ...binding, financialAccountId: "new-destination" };
		expect(await processRemote(input, changed)).toBe("unchanged");
		expect(await processRemote({ ...input, amount: -101 }, changed)).toBe("pending");
		const [review] = await sql.queryRaw<{ financialAccountId: string }>(
			`SELECT b."financialAccountId" FROM "OpenFinanceRecord" r JOIN "TransactionImport" b ON b."id"=r."importId" WHERE r."identity"='provider:bank-mapping-change'`,
		);
		expect(review.financialAccountId).toBe("account");
	});
	test("card financial conflicts become a review without partial purchases", async () => {
		const input = normalizeTransaction(
			{
				accountId: "remote-card",
				amount: 50,
				creditCardMetadata: {
					billId: "old-bill",
					installmentNumber: 1,
					purchaseDate: "2026-08-20",
					totalAmount: 100,
					totalInstallments: 2,
				},
				date: "2026-08-20",
				description: "Invalid chronology",
				id: "chronology",
			},
			true,
			[{ closingDate: "2026-07-01", dueDate: "2026-07-10", id: "old-bill" }],
		);
		expect(
			await processRemote(input, {
				...binding,
				creditCardId: "card",
				financialAccountId: null,
				remoteAccountId: "remote-card",
			}),
		).toBe("pending");
		expect(
			await sql.queryRaw(`SELECT * FROM "CreditPurchaseRecord" WHERE "description"='Invalid chronology'`),
		).toHaveLength(0);
		expect(
			await sql.queryRaw(`SELECT * FROM "CreditCardImportItem" WHERE "description"='Invalid chronology'`),
		).toHaveLength(1);
	});
	test("inconsistent totals stay in review without creating a purchase", async () => {
		const input = normalizeTransaction(
			{
				accountId: "remote-card",
				amount: 50,
				creditCardMetadata: {
					billId: "new-bill",
					installmentNumber: 1,
					purchaseDate: "2026-08-20",
					totalAmount: 10,
					totalInstallments: 2,
				},
				date: "2026-08-20",
				description: "Invalid total",
				id: "invalid-total",
			},
			true,
			[{ closingDate: "2026-09-01", dueDate: "2026-09-10", id: "new-bill" }],
		);
		expect(
			await processRemote(input, {
				...binding,
				creditCardId: "card",
				financialAccountId: null,
				remoteAccountId: "remote-card",
			}),
		).toBe("pending");
		expect(
			await sql.queryRaw(`SELECT * FROM "CreditPurchaseRecord" WHERE "description"='Invalid total'`),
		).toHaveLength(0);
	});
	test("statement charges reconcile PDF identities and allow safe bank corrections", async () => {
		const target = {
			...binding,
			creditCardId: "card",
			financialAccountId: null,
			remoteAccountId: "remote-card",
		};
		const input = normalizeTransaction(
			{
				accountId: "remote-card",
				amount: 9,
				creditCardMetadata: { billId: "charge-bill" },
				date: "2026-08-01",
				description: "IOF",
				id: "charge",
				operationType: "IOF",
			},
			true,
			[{ closingDate: "2026-09-01", dueDate: "2026-09-10", id: "charge-bill" }],
		);
		expect(await processRemote(input, target)).toBe("imported");
		expect(
			await processRemote(
				{ ...input, aliases: ["provider:charge-alias"], identity: "provider:charge-alias" },
				target,
			),
		).toBe("linked");
		expect(await processRemote({ ...input, amount: 10, totalAmount: 10 }, target)).toBe("imported");
		expect(
			await sql.queryRaw(`SELECT * FROM "CreditStatementCharge" WHERE "description"='IOF'`),
		).toHaveLength(1);
	});
	test("discovery refreshes accounts, preserves bindings and removals, and isolates failures/users", async () => {
		const { discoverConnections, addConnection } = await import("../application/configuration");
		const previousFetch = globalThis.fetch;
		const beforeBindings = await sql.queryRaw('SELECT * FROM "OpenFinanceBinding" ORDER BY "id"');
		const otherBefore = await sql.queryRaw('SELECT * FROM "OpenFinanceConnection" WHERE "userId"=$1', [
			"other",
		]);
		let listingEnabled = true;
		globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
			const target = new URL(String(input));
			if (target.pathname === "/auth") return Response.json({ apiKey: "simulated" });
			if (target.pathname === "/v2/items")
				return listingEnabled
					? Response.json({
							next: null,
							results: [
								{ connector: { name: "MeuPluggy" }, id: "discovered" },
								{ connector: { name: "Other connector" }, id: "ignored" },
							],
						})
					: Response.json({ code: 403, codeDescription: "LIST_ITEMS_FEATURE_NOT_ENABLED" }, { status: 403 });
			if (target.pathname === "/items/item-two") return new Response(null, { status: 502 });
			if (target.pathname.startsWith("/items/"))
				return Response.json({
					connector: { name: "MeuPluggy" },
					id: target.pathname.split("/").at(-1),
					status: "UPDATED",
				});
			if (target.pathname === "/accounts") {
				const itemId = target.searchParams.get("itemId")!;
				return Response.json({
					page: 1,
					results: [
						{
							id: itemId === "item" ? "remote" : `remote-${itemId}`,
							itemId,
							name: "Updated account",
							type: "BANK",
						},
					],
					totalPages: 1,
				});
			}
			throw new Error("Unexpected simulated request");
		}) as unknown as typeof fetch;
		try {
			const first = await discoverConnections("owner");
			expect(first.discoveryAvailable).toBe(true);
			expect(first.connections.some(connection => connection.itemId === "discovered")).toBe(true);
			expect(first.connections.some(connection => connection.itemId === "ignored")).toBe(false);
			expect(first.errors.some(error => error.itemId === "item-two")).toBe(true);
			expect(
				first.connections.find(connection => connection.itemId === "item")?.remoteAccounts[0]?.name,
			).toBe("Updated account");
			await discoverConnections("owner");
			expect(
				(
					await sql.queryRaw<{ count: number }>(
						`SELECT count(*)::int AS count FROM "OpenFinanceConnection" WHERE "userId"='owner' AND "itemId"='discovered'`,
					)
				)[0].count,
			).toBe(1);
			expect(await sql.queryRaw('SELECT * FROM "OpenFinanceBinding" ORDER BY "id"')).toEqual(beforeBindings);
			expect(
				await sql.queryRaw('SELECT * FROM "OpenFinanceConnection" WHERE "userId"=$1', ["other"]),
			).toEqual(otherBefore);
			const discoveredId = first.connections.find(connection => connection.itemId === "discovered")!.id;
			await disconnect("owner", discoveredId);
			expect(
				(await discoverConnections("owner")).connections.some(
					connection => connection.itemId === "discovered",
				),
			).toBe(false);
			await addConnection("owner", "discovered");
			listingEnabled = false;
			const fallback = await discoverConnections("owner");
			expect(fallback.discoveryAvailable).toBe(false);
			expect(fallback.connections.some(connection => connection.itemId === "discovered")).toBe(true);
		} finally {
			globalThis.fetch = previousFetch;
		}
	});
	test("disconnect erases credentials and bindings, preserves history and aliases", async () => {
		await disconnect("owner");
		const [config] = await sql.queryRaw<{ encryptedCredentials: string | null }>(
			'SELECT "encryptedCredentials" FROM "OpenFinanceConfig" WHERE "userId"=$1',
			["owner"],
		);
		expect(config.encryptedCredentials).toBeNull();
		expect(await sql.queryRaw('SELECT * FROM "OpenFinanceBinding"')).toHaveLength(0);
		expect((await sql.queryRaw('SELECT * FROM "Transaction"')).length).toBeGreaterThan(0);
		expect((await sql.queryRaw('SELECT * FROM "OpenFinanceIdentity"')).length).toBeGreaterThan(0);
	});
});
