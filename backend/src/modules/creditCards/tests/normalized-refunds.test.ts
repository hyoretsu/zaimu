import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import type { CreditBookDTO } from "../infra/elysia/CreditBookDTO";

const testUrl = requireFixtureUrl("NORMALIZED_PURCHASE_TEST_URL");

/** Requires the migrated schema in a fresh, explicitly named local disposable database. */
describe("normalized refund transactions", () => {
	let client: Client;
	let refunds: typeof import("../application/normalized-refunds");
	const context = {
		cardId: "normalized-test-card",
		purchaseId: "normalized-test-purchase",
		userId: "normalized-test-user",
	};
	const secondContext = { ...context, purchaseId: "normalized-test-second" };
	beforeAll(async () => {
		process.env.DATABASE_URL = testUrl;
		process.env.BETTER_AUTH_SECRET = "local-normalized-credit-tests-secret-123456789";
		process.env.REDIS_URL = requireFixtureUrl("CACHE_TEST_REDIS_URL");
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
		const originalInstallments = book.installments.filter(i => i.purchaseId === purchase!.id);
		expect(originalInstallments).toHaveLength(2);
		const converted = await request(`/credit-cards/${context.cardId}/purchases/${purchase!.id}`, "PATCH", {
			installments: 1,
		});
		expect(converted.status).toBe(200);
		const convertedBook = (await (
			await request(`/credit-cards/${context.cardId}/book`)
		).json()) as CreditBookDTO;
		const remainingInstallments = convertedBook.installments.filter(i => i.purchaseId === purchase!.id);
		expect(remainingInstallments).toHaveLength(1);
		expect(remainingInstallments[0]!.id).toBe(originalInstallments.find(i => i.number === 1)!.id);
		expect(remainingInstallments[0]!.amountCents).toBe(12000);
		expect(convertedBook.purchases.find(p => p.id === purchase!.id)!.installmentAmountsCents).toEqual([
			12000,
		]);
		expect(
			(
				await client.query(`SELECT "number","amount" FROM "CreditInstallmentRecord" WHERE "purchaseId"=$1`, [
					purchase!.id,
				])
			).rows.map(row => ({ amount: Number(row.amount), number: row.number })),
		).toEqual([{ amount: 120, number: 1 }]);
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
		// A legacy pending batch must collapse before pagination, and approval cancels only its installments.
		const { withImportedAnticipation } = await import("@zaimu/finance/imported-anticipation");
		const { creditBookEntries } = await import("@zaimu/finance/credit-book");
		const { mutateCreditBook, newBookPurchase, readCreditBook } = await import(
			"../application/normalized-credit-book"
		);
		const canceledPurchase = await mutateCreditBook(context.userId, context.cardId, b =>
			newBookPurchase(b, {
				description: "AMAZON BR SAO PAULO",
				installments: 3,
				purchaseDate: "2024-08-10",
				totalAmount: 150,
			}),
		);
		await client.query(
			`INSERT INTO "CreditCardImport" ("id","userId","creditCardId","provider","fileName","statementDate","dueDate") VALUES ('normalized-offset-import',$1,$2,'BRADESCO','offset.pdf','2024-09-30','2024-10-05')`,
			[context.userId, context.cardId],
		);
		await client.query(
			`INSERT INTO "CreditCardImportItem" ("id","creditCardImportId","externalId","purchaseDate","description","totalAmount","installmentAmount","installments","reconciledCreditPurchaseId") VALUES
			('normalized-offset-anticipation','normalized-offset-import','offset-anticipation','2024-08-10',$1,150,50,3,$2),
			('normalized-offset-credit','normalized-offset-import','offset-credit','2024-08-10','AMAZON BR SAO PAULO',-100,-100,1,NULL)`,
			[
				withImportedAnticipation("AMAZON BR SAO PAULO", [
					{ amountCents: 5000, number: 2 },
					{ amountCents: 5000, number: 3 },
				]),
				canceledPurchase.id,
			],
		);
		const reviewed = await request("/credit-card-imports/normalized-offset-import");
		expect(reviewed.status).toBe(200);
		const review = (await reviewed.json()) as {
			items: { id: string; installmentAmount: number; reconciledCreditPurchaseId: string }[];
			pendingItemCount: number;
		};
		expect(review.pendingItemCount).toBe(1);
		expect(review.items).toHaveLength(1);
		expect(review.items[0]).toMatchObject({
			id: "normalized-offset-credit",
			installmentAmount: -100,
			reconciledCreditPurchaseId: canceledPurchase.id,
		});
		const approval = await request(
			"/credit-card-imports/normalized-offset-import/items/normalized-offset-credit/approve-refund",
			"POST",
			{ purchaseId: canceledPurchase.id },
		);
		expect(approval.status).toBe(200);
		const afterOffset = await readCreditBook(context.userId, context.cardId);
		const offsetRefund = afterOffset.refunds.find(r => r.externalId === "offset-credit")!;
		expect(offsetRefund.canceledInstallmentNumbers).toEqual([2, 3]);
		expect(offsetRefund.amountCents).toBe(10000);
		const offsetRows = creditBookEntries(afterOffset).filter(row => row.purchaseId === canceledPurchase.id);
		expect(offsetRows.filter(row => row.isReimbursed).map(row => row.currentInstallment)).toEqual([2, 3]);
		expect(offsetRows.find(row => row.id === offsetRefund.id)?.installmentAmount).toBe(-0);

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

	test("bulk approval persists 125 purchases in one batch and rolls back a failed batch", async () => {
		const { approveItems } = await import("../../credit-card-imports/application/import-service");
		const { getQueryMetrics, withQueryMetrics } = await import("sql");
		const importId = "normalized-test-large-import";
		await client.query(
			`INSERT INTO "CreditCardImport" ("id","userId","creditCardId","provider","fileName","statementDate","dueDate") VALUES ($1,$2,$3,'INTER','large.pdf','2024-12-31','2025-01-05')`,
			[importId, context.userId, context.cardId],
		);
		await client.query(
			`INSERT INTO "CreditCardImportItem" ("id","creditCardImportId","externalId","purchaseDate","description","totalAmount","installmentAmount") SELECT 'large-item-' || i, $1, 'large-external-' || i, '2024-12-10'::date, 'Compra grande ' || i, 10, 10 FROM generate_series(1,125) i`,
			[importId],
		);
		// Fail only at final approval, after purchases and review effects have been written.
		await client.query(
			`CREATE FUNCTION reject_large_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."id" = 'normalized-test-large-import' AND NEW."status" = 'APPROVED' THEN RAISE EXCEPTION 'forced bulk approval failure'; END IF; RETURN NEW; END $$`,
		);
		await client.query(
			`CREATE TRIGGER reject_large_import BEFORE UPDATE ON "CreditCardImport" FOR EACH ROW EXECUTE FUNCTION reject_large_import()`,
		);
		try {
			await expect(approveItems(context.userId, importId)).rejects.toThrow("forced bulk approval failure");
			expect(
				(
					await client.query(
						`SELECT "id" FROM "CreditPurchaseRecord" WHERE "externalId" LIKE 'large-external-%'`,
					)
				).rows,
			).toHaveLength(0);
			expect(
				(
					await client.query(`SELECT "id" FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1`, [
						importId,
					])
				).rows,
			).toHaveLength(125);
		} finally {
			await client.query(`DROP TRIGGER reject_large_import ON "CreditCardImport"`);
			await client.query("DROP FUNCTION reject_large_import()");
		}
		await withQueryMetrics(async () => {
			expect(await approveItems(context.userId, importId)).toEqual({ created: 125 });
			const spans = getQueryMetrics()!.spans;
			// Batch persistence, fully-synced marker and statement payment reconciliation.
			expect(spans.filter(span => span.name === "credit-book:persist").length).toBeLessThanOrEqual(3);
		});
		expect(
			(
				await client.query(
					`SELECT "id" FROM "CreditPurchaseRecord" WHERE "externalId" LIKE 'large-external-%'`,
				)
			).rows,
		).toHaveLength(125);
		expect(
			(
				await client.query(`SELECT "id" FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1`, [
					importId,
				])
			).rows,
		).toHaveLength(0);
		expect(
			(await client.query(`SELECT "status" FROM "CreditCardImport" WHERE "id"=$1`, [importId])).rows[0]
				.status,
		).toBe("APPROVED");
	}, 30_000);

	test("reconciled imports persist every external identity and reuse the same purchase", async () => {
		const { materializeImportedPurchase } = await import(
			"../../credit-card-imports/application/materialize-imported-purchase"
		);
		const { rememberImportIdentity } = await import(
			"../../credit-card-imports/application/import-identities"
		);
		const { queryRaw, withRawTransaction } = await import("~/shared/infra/sql");
		const card = {
			cashbackAccountId: null,
			cashbackRate: null,
			cashbackYieldPeriod: null,
			cashbackYieldReferencePercentage: null,
			cashbackYieldReferenceRate: null,
			dueDay: 5,
			id: "normalized-test-card",
			statementDay: 31,
			userId: "normalized-test-user",
		};
		const first = {
			currentInstallment: 1,
			description: "Lâminas de barbear Gillette x16",
			dueDate: new Date("2026-02-25"),
			existingRootId: null,
			externalId: "pdf-first-identity",
			installmentAmount: 18.77,
			installments: 5,
			purchaseDate: new Date("2026-01-27"),
			statementDate: new Date("2026-02-12"),
			storeName: null,
			tagIds: [],
			time: null,
			totalAmount: 93.77,
		};
		const id = await materializeImportedPurchase(card, first);
		const second = {
			...first,
			currentInstallment: 2,
			dueDate: new Date("2026-03-25"),
			existingRootId: id,
			externalId: "pdf-second-identity",
			installmentAmount: 18.75,
			statementDate: new Date("2026-03-12"),
		};
		expect(await materializeImportedPurchase(card, second)).toBe(id);
		expect(await materializeImportedPurchase(card, { ...second, existingRootId: null })).toBe(id);
		expect(await materializeImportedPurchase(card, first)).toBe(id);
		expect(
			await queryRaw(
				`SELECT "externalId" FROM "CreditPurchaseImportIdentity" WHERE "purchaseId"=$1 ORDER BY "externalId"`,
				[id],
			),
		).toEqual([{ externalId: first.externalId }, { externalId: second.externalId }]);
		expect(
			(
				await queryRaw<{ externalId: string }>(
					`SELECT "externalId" FROM "CreditPurchaseRecord" WHERE "id"=$1`,
					[id],
				)
			)[0]?.externalId,
		).toBe(first.externalId);
		await expect(
			withRawTransaction(query => rememberImportIdentity(query, first.externalId, "normalized-test-second")),
		).rejects.toThrow("Identificador importado já vinculado a outra compra");
		await expect(
			withRawTransaction(async query => {
				await rememberImportIdentity(query, "rolled-back-identity", id);
				throw new Error("rollback identity");
			}),
		).rejects.toThrow("rollback identity");
		expect(
			await queryRaw(
				`SELECT 1 FROM "CreditPurchaseImportIdentity" WHERE "externalId"='rolled-back-identity'`,
			),
		).toEqual([]);
		await withRawTransaction(query => query(`DELETE FROM "CreditPurchaseRecord" WHERE "id"=$1`, [id]));
		expect(
			await queryRaw(`SELECT 1 FROM "CreditPurchaseImportIdentity" WHERE "purchaseId"=$1`, [id]),
		).toEqual([]);
	});
});
