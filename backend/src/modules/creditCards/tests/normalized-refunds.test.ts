import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { Client } from "pg";
import type { CreditBookDTO } from "../infra/elysia/CreditBookDTO";

const testUrl = process.env.NORMALIZED_PURCHASE_TEST_URL;

/** Requires the migrated schema in a fresh, explicitly named local disposable database. */
describe.skipIf(!testUrl)("normalized refund transactions", () => {
	let client: Client;
	let refunds: typeof import("../application/normalized-refunds");
	const context = {
		cardId: "normalized-test-card",
		purchaseId: "normalized-test-purchase",
		userId: "normalized-test-user",
	};
	const secondContext = { ...context, purchaseId: "normalized-test-second" };
	beforeAll(async () => {
		const url = new URL(testUrl!);
		if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/zaimu_credit_test")
			throw new Error("Teste exige banco descartável local zaimu_credit_test");
		process.env.DATABASE_URL = testUrl;
		process.env.BETTER_AUTH_SECRET = "local-normalized-credit-tests-secret-123456789";
		process.env.REDIS_URL = "redis://127.0.0.1:6399";
		process.env.BETTER_AUTH_URL = "http://localhost:3333";
		refunds = await import("../application/normalized-refunds");
		client = new Client({ connectionString: testUrl });
		await client.connect();
		await client.query(`
 BEGIN;
		 INSERT INTO "user" ("id", "email", "name") VALUES ('normalized-test-user', 'normalized@example.test', 'Teste');
		 INSERT INTO "FinancialInstitution" ("id", "userId", "name", "normalizedName")
		 VALUES ('normalized-test-bank', 'normalized-test-user', 'Banco', 'banco');
		 INSERT INTO "FinancialAccount" ("id", "userId", "name", "type", "institutionId")
		 VALUES ('normalized-test-account', 'normalized-test-user', 'Cartão', 'CREDIT_CARD', 'normalized-test-bank');
		 INSERT INTO "CreditCard" ("id", "financialAccountId", "creditLimit", "statementDay", "dueDay")
		 VALUES ('normalized-test-card', 'normalized-test-account', 5000, 31, 5);
		 INSERT INTO "CreditPurchaseRecord" ("id", "userId", "creditCardId", "description", "purchaseDate", "totalAmount")
		 VALUES ('normalized-test-purchase', 'normalized-test-user', 'normalized-test-card', 'Compra', '2024-08-10', 300),
		 ('normalized-test-second', 'normalized-test-user', 'normalized-test-card', 'Outra compra', '2024-08-10', 100),
		 ('normalized-test-sync', 'normalized-test-user', 'normalized-test-card', 'Compra offline', '2024-08-10', 100);
		 INSERT INTO "CreditInstallmentPlan" ("purchaseId", "number", "amount")
		 VALUES ('normalized-test-purchase', 1, 100), ('normalized-test-purchase', 2, 100), ('normalized-test-purchase', 3, 100),
		 ('normalized-test-second', 1, 100), ('normalized-test-sync', 1, 100);
 COMMIT;
		`);
	});

	afterAll(async () => {
		await client?.query(`DELETE FROM "user" WHERE "id" = 'normalized-test-user'`);
		await client?.end();
		const sql = await import("~/shared/infra/sql");
		await sql.closeDatabase();
	});

	test("full refund posts difference and locks institution policy; edit keeps ID", async () => {
		const refund = await refunds.createNormalizedRefund(context, {
			creditDate: "2024-08-20",
			policy: "CANCEL_FUTURE_INSTALLMENTS",
		});
		expect(refund.amountCents).toBe(30000);
		expect(refund.cancellationEligible).toBe(true);
		// First purchase cancels future R$ 200 and posts R$ 100 credit. Two other purchases remain R$ 200.
		expect(
			Number(
				(
					await client.query(`SELECT "totalAmount" FROM "CreditCardStatement" WHERE "id" = $1`, [
						refund.creditStatementId,
					])
				).rows[0].totalAmount,
			),
		).toBe(200);
		expect(
			(
				await client.query(
					`SELECT "creditRefundPolicy" FROM "FinancialInstitution" WHERE "id" = 'normalized-test-bank'`,
				)
			).rows[0].creditRefundPolicy,
		).toBe("CANCEL_FUTURE_INSTALLMENTS");
		const edited = await refunds.editNormalizedRefund(context, refund.id, {
			amount: 100,
			creditDate: "2024-09-20",
		});
		expect(edited.id).toBe(refund.id);
		expect(edited.amountCents).toBe(10000);
		expect(edited.cancellationEligible).toBe(false);
		const rows = await client.query(`SELECT "id" FROM "CreditRefundRecord" WHERE "purchaseId" = $1`, [
			context.purchaseId,
		]);
		expect(rows.rows).toEqual([{ id: refund.id }]);
		await refunds.deleteNormalizedRefund(context, refund.id);
		expect(
			(await client.query(`SELECT "deletedAt" FROM "CreditRefundRecord" WHERE "id" = $1`, [refund.id]))
				.rows[0].deletedAt,
		).not.toBeNull();
	});

	test("concurrent partial refunds cannot exceed purchase total", async () => {
		const results = await Promise.allSettled([
			refunds.createNormalizedRefund(secondContext, { amount: 70, creditDate: "2024-08-20" }),
			refunds.createNormalizedRefund(secondContext, { amount: 70, creditDate: "2024-08-20" }),
		]);
		expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
		expect(
			Number(
				(
					await client.query(
						`SELECT sum("amount") FROM "CreditRefundRecord" WHERE "purchaseId" = $1 AND "deletedAt" IS NULL`,
						[secondContext.purchaseId],
					)
				).rows[0].sum,
			),
		).toBe(70);
	});

	test("failure during replay rolls back refund and institutional state", async () => {
		await client.query(
			`CREATE FUNCTION fail_normalized_replay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected replay failure'; END $$; CREATE TRIGGER fail_normalized_replay BEFORE UPDATE ON "CreditCardStatement" FOR EACH ROW EXECUTE FUNCTION fail_normalized_replay();`,
		);
		await expect(
			refunds.createNormalizedRefund(secondContext, { amount: 10, creditDate: "2024-08-20" }),
		).rejects.toThrow();
		expect(
			Number(
				(
					await client.query(`SELECT count(*) FROM "CreditRefundRecord" WHERE "purchaseId" = $1`, [
						secondContext.purchaseId,
					])
				).rows[0].count,
			),
		).toBe(1);
		await client.query(
			`DROP TRIGGER fail_normalized_replay ON "CreditCardStatement"; DROP FUNCTION fail_normalized_replay();`,
		);
	});

	test("sync tombstone removes a deleted purchase without resurrecting it", async () => {
		const { readCreditBook } = await import("../application/normalized-credit-book");
		const { syncCreditBook } = await import("../application/sync-credit-book");
		const book = await readCreditBook(context.userId, context.cardId);
		const stale = structuredClone(book);
		book.deletedPurchaseIds = ["normalized-test-sync"];
		book.purchases = book.purchases.filter(purchase => purchase.id !== "normalized-test-sync");
		book.installments = book.installments.filter(
			installment => installment.purchaseId !== "normalized-test-sync",
		);
		await syncCreditBook(context.userId, book);
		expect(
			(await client.query(`SELECT "id" FROM "CreditPurchaseRecord" WHERE "id" = 'normalized-test-sync'`))
				.rows,
		).toHaveLength(0);
		await expect(syncCreditBook(context.userId, stale)).rejects.toThrow("Compra excluída");
	});

	test("fixed debt split and refund event identities survive edits and deletion", async () => {
		const { mutateCreditBook, newBookPurchase } = await import("../application/normalized-credit-book");
		await client.query(
			`INSERT INTO "DebtPerson" ("id","userId","name","normalizedName") VALUES ('normalized-test-person',$1,'Pessoa','pessoa')`,
			[context.userId],
		);
		const purchaseId = await mutateCreditBook(
			context.userId,
			context.cardId,
			book =>
				newBookPurchase(book, {
					debtSplitRule: {
						mode: "FIXED",
						ownerIncluded: true,
						participants: [{ debtPersonId: "normalized-test-person", fixedAmount: 33.33 }],
					},
					description: "Rateada",
					installments: 1,
					purchaseDate: "2024-08-10",
					totalAmount: 100,
				}).id,
		);
		const split = await client.query(
			`SELECT s."id",p."id" AS "participantId" FROM "DebtSplit" s JOIN "DebtSplitParticipant" p ON p."debtSplitId"=s."id" WHERE s."creditPurchaseId"=$1`,
			[purchaseId],
		);
		const target = { ...context, purchaseId };
		const refund = await refunds.createNormalizedRefund(target, { amount: 30, creditDate: "2024-08-20" });
		const event = await client.query(
			`SELECT e."id",e."effect" FROM "DebtPurchaseLink" l JOIN "DebtEvent" e ON e."id"=l."eventId" WHERE l."creditPurchaseId"=$1`,
			[refund.id],
		);
		expect(Number(event.rows[0].effect)).toBe(-9.99);
		await refunds.editNormalizedRefund(target, refund.id, { amount: 60 });
		const edited = await client.query(`SELECT "id","effect" FROM "DebtEvent" WHERE "id"=$1`, [
			event.rows[0].id,
		]);
		expect(Number(edited.rows[0].effect)).toBe(-19.99);
		await mutateCreditBook(context.userId, context.cardId, book => {
			const p = book.purchases.find(p => p.id === purchaseId)!;
			p.debtSplitRule = {
				mode: "FIXED",
				ownerIncluded: true,
				participants: [{ debtPersonId: "normalized-test-person", fixedAmount: 40 }],
			};
		});
		expect(
			(
				await client.query(
					`SELECT s."id",p."id" AS "participantId" FROM "DebtSplit" s JOIN "DebtSplitParticipant" p ON p."debtSplitId"=s."id" WHERE s."creditPurchaseId"=$1`,
					[purchaseId],
				)
			).rows,
		).toEqual(split.rows);
		await refunds.deleteNormalizedRefund(target, refund.id);
		expect(
			Number(
				(await client.query(`SELECT "effect" FROM "DebtEvent" WHERE "id"=$1`, [event.rows[0].id])).rows[0]
					.effect,
			),
		).toBe(0);
		const before = Number(
			(
				await client.query(`SELECT count(*) AS n FROM "DebtEvent" WHERE "createdByUserId"=$1`, [
					context.userId,
				])
			).rows[0].n,
		);
		await client.query(
			`CREATE FUNCTION fail_debt_replay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected debt replay failure'; END $$; CREATE TRIGGER fail_debt_replay BEFORE UPDATE ON "CreditCardStatement" FOR EACH ROW EXECUTE FUNCTION fail_debt_replay();`,
		);
		try {
			await expect(
				refunds.createNormalizedRefund(target, { amount: 10, creditDate: "2024-08-20" }),
			).rejects.toThrow();
			expect(
				Number(
					(
						await client.query(`SELECT count(*) AS n FROM "DebtEvent" WHERE "createdByUserId"=$1`, [
							context.userId,
						])
					).rows[0].n,
				),
			).toBe(before);
		} finally {
			await client.query(
				`DROP TRIGGER fail_debt_replay ON "CreditCardStatement"; DROP FUNCTION fail_debt_replay();`,
			);
		}
	});
	test("authenticated HTTP contracts, import review, owner isolation and atomic reconstruction", async () => {
		const { default: Elysia } = await import("elysia");
		const { CreditCardsController } = await import("../infra/elysia/CreditCardsController");
		const { CreditCardImportsController } = await import(
			"../../credit-card-imports/infra/elysia/CreditCardImportsController"
		);
		const { HttpException } = await import("~/shared/errors");
		const app = new Elysia()
			.error({ HttpException })
			.onError(({ error, set }) => {
				if (error instanceof HttpException) {
					set.status = error.statusCode;
					return { error: error.message };
				}
			})
			.use(CreditCardsController)
			.use(CreditCardImportsController);
		const token = "normalized-test-session";
		await client.query(
			`INSERT INTO "session" ("id","token","userId","expiresAt") VALUES ('normalized-test-session',$1,$2,now()+interval '7 days')`,
			[token, context.userId],
		);
		const { auth } = await import("~/modules/auth/auth");
		const authContext = await auth.$context;
		const session = await authContext.internalAdapter.findSession(token);
		expect(session).not.toBeNull();
		expect(session!.session.expiresAt.getTime()).toBeGreaterThan(Date.now());
		const cookie = `${authContext.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${createHmac("sha256", authContext.secret).update(token).digest("base64")}`)}`;
		const request = (path: string, method = "GET", body?: unknown, authenticated = true) =>
			app.handle(
				new Request(`http://localhost${path}`, {
					headers: { "content-type": "application/json", ...(authenticated ? { cookie } : {}) },
					method,
					...(body ? { body: JSON.stringify(body) } : {}),
				}),
			);
		expect((await request(`/credit-cards/${context.cardId}/book`, "GET", undefined, false)).status).toBe(401);
		expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).not.toBeNull();
		const initial = await request(`/credit-cards/${context.cardId}/book`);
		expect(initial.status).toBe(200);
		const initialBook = (await initial.json()) as CreditBookDTO;
		expect(initialBook.purchases.length).toBeGreaterThan(0);
		const created = await request(`/credit-cards/${context.cardId}/purchases`, "POST", {
			description: "HTTP compra",
			installments: 2,
			purchaseDate: "2024-08-10",
			storeName: "Loja",
			totalAmount: 120,
		});
		expect(created.status).toBe(200);
		const book = (await (await request(`/credit-cards/${context.cardId}/book`)).json()) as CreditBookDTO;
		const purchase = book.purchases.find((p: { description: string }) => p.description === "HTTP compra");
		expect(purchase!.totalAmountCents).toBe(12000);
		const first = await request(`/credit-cards/${context.cardId}/purchases/${purchase!.id}/refunds`, "POST", {
			amount: 20,
			purchaseDate: "2024-09-10",
		});
		expect(first.status).toBe(200);
		const refund = (await first.json()) as { id: string };
		const edited = await request(
			`/credit-cards/${context.cardId}/purchases/${purchase!.id}/refunds/${refund.id}`,
			"PATCH",
			{ amount: 30, purchaseDate: "2024-09-11" },
		);
		expect(edited.status).toBe(200);
		expect(((await edited.json()) as { id: string }).id).toBe(refund.id);
		expect(
			(
				await request(`/credit-cards/${context.cardId}/purchases/${purchase!.id}/refunds`, "POST", {
					amount: 100,
					purchaseDate: "2024-09-12",
				})
			).status,
		).toBe(400);
		await client.query(
			`INSERT INTO "user" ("id","email","name") VALUES ('normalized-test-outsider','normalized-outsider@example.test','Outro'); INSERT INTO "FinancialAccount" ("id","userId","type") VALUES ('normalized-test-foreign','normalized-test-outsider','CHECKING');`,
		);
		try {
			const { mutateCreditBook, newBookPurchase } = await import("../application/normalized-credit-book");
			await expect(
				mutateCreditBook(context.userId, context.cardId, b =>
					newBookPurchase(b, {
						cashbackAccountId: "normalized-test-foreign",
						description: "Inválida",
						installments: 1,
						purchaseDate: "2024-08-10",
						totalAmount: 10,
					}),
				),
			).rejects.toThrow("Vínculo pertence a outro usuário");
		} finally {
			await client.query(`DELETE FROM "user" WHERE "id"='normalized-test-outsider'`);
		}
		await client.query(
			`INSERT INTO "CreditCardImport" ("id","userId","creditCardId","provider","fileName","statementDate","dueDate") VALUES ('normalized-test-import',$1,$2,'INTER','refund.pdf','2024-09-30','2024-10-05')`,
			[context.userId, context.cardId],
		);
		await client.query(
			`INSERT INTO "CreditCardImportItem" ("id","creditCardImportId","externalId","purchaseDate","time","description","totalAmount","installmentAmount") VALUES ('normalized-test-import-item','normalized-test-import','bank-refund-id','2024-09-12','14:30','Crédito',-15,-15)`,
		);
		const path =
			"/credit-card-imports/normalized-test-import/items/normalized-test-import-item/approve-refund";
		expect((await request(path, "POST", {})).status).toBe(400);
		const before = Number(
			(
				await client.query(`SELECT count(*) AS n FROM "CreditPurchaseRecord" WHERE "creditCardId"=$1`, [
					context.cardId,
				])
			).rows[0].n,
		);
		expect(
			(
				await request(path, "POST", {
					purchase: { description: "Inválida", installments: 1, purchaseDate: "2024-08-10", totalAmount: 10 },
				})
			).status,
		).toBe(400);
		expect(
			Number(
				(
					await client.query(`SELECT count(*) AS n FROM "CreditPurchaseRecord" WHERE "creditCardId"=$1`, [
						context.cardId,
					])
				).rows[0].n,
			),
		).toBe(before);
		const approvals = await Promise.all([
			request(path, "POST", { purchaseId: purchase!.id }),
			request(path, "POST", { purchaseId: purchase!.id }),
		]);
		expect(approvals.filter(r => r.status === 200)).toHaveLength(1);
		expect(approvals.filter(r => r.status >= 400)).toHaveLength(1);
		const imported = (
			await client.query(
				`SELECT "externalId","time","amount" FROM "CreditRefundRecord" WHERE "externalId"='bank-refund-id'`,
			)
		).rows;
		expect(imported).toHaveLength(1);
		expect(Number(imported[0].amount)).toBe(15);
		expect(imported[0].time).toStartWith("14:30");
		expect(
			(await client.query(`SELECT "status" FROM "CreditCardImport" WHERE "id"='normalized-test-import'`))
				.rows[0].status,
		).toBe("APPROVED");
		expect(
			(
				await request(
					`/credit-cards/${context.cardId}/purchases/${purchase!.id}/refunds/${refund.id}`,
					"DELETE",
				)
			).status,
		).toBe(200);
		const statements = await request(`/credit-cards/${context.cardId}/statements`);
		expect(statements.status).toBe(200);
		expect(((await statements.json()) as { items: unknown[] }).items.length).toBeGreaterThan(0);
	}, 30000);

	test("future split persistence, matched debts, normalized dashboard forecasts and cumulative rewards", async () => {
		const { mutateCreditBook, newBookPurchase, readCreditBook } = await import(
			"../application/normalized-credit-book"
		);
		const { withStatementPayments } = await import("../application/statement-payments");
		const { createDebtEvent, linkPurchaseToDebt } = await import("~/modules/debts/application");
		await client.query(
			`INSERT INTO "FinancialAccount" ("id","userId","type") VALUES ('normalized-test-rewards',$1,'REWARDS')`,
			[context.userId],
		);
		await client.query(
			`INSERT INTO "RewardsAccount" ("financialAccountId","kind","initialBalance") VALUES ('normalized-test-rewards','CASHBACK',0)`,
		);
		const futureId = await mutateCreditBook(
			context.userId,
			context.cardId,
			b =>
				newBookPurchase(b, {
					debtSplitRule: {
						mode: "FIXED",
						ownerIncluded: true,
						participants: [{ debtPersonId: "normalized-test-person", fixedAmount: 40 }],
					},
					description: "Futura",
					installments: 2,
					purchaseDate: "2099-01-10",
					totalAmount: 100,
				}).id,
		);
		const loaded = await readCreditBook(context.userId, context.cardId);
		expect(loaded.purchases.find(p => p.id === futureId)?.debtSplitRule?.mode).toBe("FIXED");
		expect(loaded.installments.filter(i => i.purchaseId === futureId)).toHaveLength(0);
		const projected = await withStatementPayments(
			loaded.statements.map(s => ({
				...s,
				dueDate: new Date(s.dueDate),
				statementDate: new Date(s.statementDate),
			})),
		);
		expect(projected.some(s => s.isForecast && s.statementDate.getUTCFullYear() === 2099)).toBe(true);
		const rewardId = await mutateCreditBook(
			context.userId,
			context.cardId,
			b =>
				newBookPurchase(b, {
					cashbackAccountId: "normalized-test-rewards",
					cashbackAmount: 1,
					description: "Recompensa",
					installments: 1,
					purchaseDate: "2024-08-10",
					totalAmount: 3,
				}).id,
		);
		for (let i = 0; i < 3; i++)
			await refunds.createNormalizedRefund(
				{ ...context, purchaseId: rewardId },
				{ amount: 1, creditDate: `2024-08-${20 + i}` },
			);
		const { getFinancialAccountBalances } = await import(
			"~/modules/accounts/application/get-financial-account-balances"
		);
		expect(
			(await getFinancialAccountBalances(["normalized-test-rewards"])).get("normalized-test-rewards"),
		).toBe(0);
		const matchedId = await mutateCreditBook(
			context.userId,
			context.cardId,
			b =>
				newBookPurchase(b, {
					description: "Conciliada",
					installments: 1,
					purchaseDate: "2024-08-10",
					totalAmount: 100,
				}).id,
		);
		const event = await createDebtEvent({
			amount: 100,
			createdByUserId: context.userId,
			date: "2024-08-10",
			debtPersonId: "normalized-test-person",
			effect: 100,
			kind: "PURCHASE",
		});
		await linkPurchaseToDebt({
			creditPurchaseId: matchedId,
			date: "2024-08-10",
			matchEventId: event.id,
			totalAmount: 100,
			userId: context.userId,
		});
		const refund = await refunds.createNormalizedRefund(
			{ ...context, purchaseId: matchedId },
			{ amount: 20, creditDate: "2024-08-20" },
		);
		expect(
			Number(
				(
					await client.query(
						`SELECT e."effect" FROM "DebtPurchaseLink" l JOIN "DebtEvent" e ON e."id"=l."eventId" WHERE l."creditPurchaseId"=$1`,
						[refund.id],
					)
				).rows[0].effect,
			),
		).toBe(-20);
	}, 30000);
});
