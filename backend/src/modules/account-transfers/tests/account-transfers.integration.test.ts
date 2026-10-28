import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { replayCreditBook } from "@zaimu/finance/credit-book";
import { Client } from "pg";
import { closeDatabase, queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { getFinancialAccountBalances } from "../../accounts/application/get-financial-account-balances";
import { accountCardRules } from "../../accounts/application/institution-card-rules";
import { loadCreditBook } from "../../creditCards/application/normalized-credit-book";
import { deliverNotifications } from "../../notifications/notification-deliveries";
import {
	createAccountTransfer,
	listAccountTransfers,
	previewAccountTransfer,
	respondAccountTransfer,
} from "../application/account-transfers";

const url = requireFixtureUrl("DATABASE_URL");
const sender = "transfer-sender",
	recipient = "transfer-recipient",
	stranger = "transfer-stranger";
async function account(id: string, userId = sender, type = "CHECKING", name = id) {
	await queryRaw(
		`INSERT INTO "FinancialAccount" ("id","userId","name","type","currency") VALUES ($1,$2,$3,$4::"FinancialAccountType",'BRL')`,
		[id, userId, name, type],
	);
}
async function invite(ids: string[]) {
	return createAccountTransfer(sender, {
		accountIds: ids,
		recipientEmail: "transfer-recipient@example.test",
	});
}
async function accept(id: string) {
	const preview = await previewAccountTransfer(recipient, id);
	return respondAccountTransfer(recipient, id, "ACCEPTED", preview.version!);
}
beforeAll(async () => {
	const client = new Client({ connectionString: url });
	await client.connect();
	await installContractFixture(
		client,
		await Bun.file(
			new URL("../../../../../packages/sql/out/prisma/contract.json", import.meta.url),
		).json(),
	);
	await client.query(
		await Bun.file(
			new URL("../../../../../packages/sql/scripts/account-transfer-guards.sql", import.meta.url),
		).text(),
	);
	await client.end();
	for (const id of [sender, recipient, stranger])
		await queryRaw(
			`INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt") VALUES ($1,$1,$2,true,now(),now())`,
			[id, `${id}@example.test`],
		);
});
afterAll(() => closeDatabase());
describe("account ownership transfers", () => {
	test("moves account history, preserves balance and prevents source writes", async () => {
		await account("solo");
		await queryRaw(
			`INSERT INTO "Transaction" ("id","userId","amount","date","type","destinationFinancialAccountId") VALUES ('solo-in',$1,123.45,'2026-01-01','INCOME','solo')`,
			[sender],
		);
		const invitation = await invite(["solo"]);
		expect((await listAccountTransfers(stranger)).length).toBe(0);
		await expect(previewAccountTransfer(stranger, invitation.id)).rejects.toThrow(
			"Convite não encontrado",
		);
		const before = await getFinancialAccountBalances(["solo"]);
		await accept(invitation.id);
		expect((await getFinancialAccountBalances(["solo"])).get("solo")).toBe(before.get("solo"));
		expect((await queryRaw(`SELECT "userId" FROM "FinancialAccount" WHERE "id"='solo'`))[0]?.userId).toBe(
			recipient,
		);
		await expect(
			withRawTransaction(async () => {
				await queryRaw(`SELECT set_config('zaimu.request_user',$1,true)`, [sender]);
				await queryRaw(`UPDATE "FinancialAccount" SET "name"='stale' WHERE "id"='solo'`);
			}),
		).rejects.toThrow();
		await expect(
			queryRaw(
				`INSERT INTO "Transaction" ("id","userId","amount","date","type","originFinancialAccountId") VALUES ('stale-link',$1,1,'2026-01-01','EXPENSE','solo')`,
				[sender],
			),
		).rejects.toThrow();
		expect((await respondAccountTransfer(recipient, invitation.id, "ACCEPTED", "old")).status).toBe(
			"ACCEPTED",
		);
		expect((await previewAccountTransfer(sender, invitation.id)).accounts).toEqual([]);
	});
	test("rejects stale review and overlapping invitations; cancellation is final", async () => {
		await account("edited");
		const invitation = await invite(["edited"]);
		await expect(invite(["edited"])).rejects.toThrow("pendente");
		const preview = await previewAccountTransfer(recipient, invitation.id);
		await queryRaw(`UPDATE "FinancialAccount" SET "name"='changed' WHERE "id"='edited'`);
		await expect(
			respondAccountTransfer(recipient, invitation.id, "ACCEPTED", preview.version!),
		).rejects.toThrow("Dados alterados");
		expect(
			(await queryRaw(`SELECT "userId" FROM "FinancialAccount" WHERE "id"='edited'`))[0]?.userId,
		).toBe(sender);
		await expect(
			respondAccountTransfer(sender, invitation.id, "ACCEPTED", preview.version!),
		).rejects.toThrow();
		await respondAccountTransfer(sender, invitation.id, "CANCELLED");
		await expect(accept(invitation.id)).rejects.toThrow();
	});
	test("separates a transfer without changing either side balance or treating it as income", async () => {
		await account("split-a");
		await account("split-b");
		await queryRaw(
			`INSERT INTO "Transaction" ("id","userId","amount","destinationAmount","date","type","originFinancialAccountId","destinationFinancialAccountId") VALUES ('split',$1,42,42,'2026-01-02','TRANSFER','split-a','split-b')`,
			[sender],
		);
		const before = await getFinancialAccountBalances(["split-a", "split-b"]);
		const invitation = await invite(["split-b"]);
		await accept(invitation.id);
		expect([...(await getFinancialAccountBalances(["split-a", "split-b"]))]).toEqual([...before]);
		const rows = await queryRaw(
			`SELECT * FROM "Transaction" WHERE "originFinancialAccountId"='split-a' OR "destinationFinancialAccountId"='split-b'`,
		);
		expect(rows).toHaveLength(2);
		expect(rows.every(row => row.type === "TRANSFER")).toBe(true);
		expect(rows.find(row => row.userId === recipient)?.originFinancialAccountId).toBeNull();
		await expect(queryRaw(`UPDATE "Transaction" SET "amount"=1 WHERE "id"='split'`)).rejects.toThrow(
			"protected",
		);
	});
	test("moves card payments independently while preserving payment book and cash", async () => {
		await account("payer");
		await account("card-account", sender, "CREDIT_CARD");
		await queryRaw(
			`INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","statementDay","dueDay","paymentAccountId") VALUES ('card','card-account',1000,20,27,'payer')`,
		);
		await queryRaw(
			`INSERT INTO "Transaction" ("id","userId","amount","paymentAmount","date","type","originFinancialAccountId","paymentCreditCardId") VALUES ('card-payment',$1,50,50,'2026-02-01','EXPENSE','payer','card')`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "CreditCardStatement" ("id","creditCardId","statementDate","dueDate","totalAmount") VALUES ('transfer-statement','card','2026-02-20','2026-02-27',100)`,
		);
		await queryRaw(
			`INSERT INTO "CreditPurchaseRecord" ("id","userId","creditCardId","description","purchaseDate","totalAmount") VALUES ('transfer-purchase',$1,'card','Compra','2026-02-01',100)`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "CreditInstallmentPlan" ("purchaseId","number","amount","statementDate","dueDate") VALUES ('transfer-purchase',1,100,'2026-02-20','2026-02-27')`,
		);
		await queryRaw(
			`INSERT INTO "CreditInstallmentRecord" ("id","purchaseId","statementId","number","amount","occurrenceDate") VALUES ('transfer-installment','transfer-purchase','transfer-statement',1,100,'2026-02-01')`,
		);
		const beforeBook = replayCreditBook(await loadCreditBook(queryRaw, sender, "card", false, false));
		const invitation = await invite(["card-account"]);
		await accept(invitation.id);
		expect(
			replayCreditBook(await loadCreditBook(queryRaw, recipient, "card", false, false)).statements,
		).toEqual(beforeBook.statements);
		expect((await getFinancialAccountBalances(["payer"])).get("payer")).toBe(-50);
		expect(
			(await queryRaw(`SELECT * FROM "Transaction" WHERE "paymentCreditCardId"='card'`))[0]?.userId,
		).toBe(recipient);
		expect(
			(await queryRaw(`SELECT "paymentAccountId" FROM "CreditCard" WHERE "id"='card'`))[0]
				?.paymentAccountId,
		).toBeNull();
	});
	test("preserves cashback credits and existing reversals across card separation", async () => {
		await account("reward", sender, "REWARDS");
		await account("reward-card-account", sender, "CREDIT_CARD");
		await queryRaw(
			`INSERT INTO "RewardsAccount" ("id","financialAccountId","kind","initialBalance") VALUES ('reward-kind','reward','CASHBACK',5)`,
		);
		await queryRaw(
			`INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","statementDay","dueDay","cashbackAccountId") VALUES ('reward-card','reward-card-account',1000,20,27,'reward')`,
		);
		await queryRaw(
			`INSERT INTO "CreditPurchaseRecord" ("id","userId","creditCardId","description","purchaseDate","totalAmount","cashbackAccountId","cashbackAmount") VALUES ('reward-purchase',$1,'reward-card','Compra','2026-01-01',100,'reward',10)`,
			[sender],
		);
		const before = (await getFinancialAccountBalances(["reward"])).get("reward");
		const invitation = await invite(["reward"]);
		await accept(invitation.id);
		expect((await getFinancialAccountBalances(["reward"])).get("reward")).toBe(before);
		expect(
			(
				await queryRaw(
					`SELECT "cashbackAccountId" FROM "CreditPurchaseRecord" WHERE "id"='reward-purchase'`,
				)
			)[0]?.cashbackAccountId,
		).toBeNull();
		expect(
			await queryRaw(`SELECT * FROM "DetachedRewardCredit" WHERE "financialAccountId"='reward'`),
		).toHaveLength(1);
	});
	test("moves compatible schedules and pauses cross-owner schedules", async () => {
		await account("schedule-a");
		await account("schedule-b");
		for (const [id, movement, destination] of [
			["schedule-one", "EXPENSE", null],
			["schedule-both", "TRANSFER", "schedule-b"],
		] as const)
			await queryRaw(
				`INSERT INTO "Recurrence" ("id","userId","name","amount","movement","unit","startDate","originFinancialAccountId","destinationFinancialAccountId") VALUES ($1,$2,$1,10,$3,'MONTH','2026-01-01','schedule-a',$4)`,
				[id, sender, movement, destination],
			);
		const invitation = await invite(["schedule-a"]);
		await accept(invitation.id);
		const rows = await queryRaw(
			`SELECT * FROM "Recurrence" WHERE "id" IN ('schedule-one','schedule-both')`,
		);
		expect(rows.find(row => row.id === "schedule-one")?.userId).toBe(recipient);
		expect(rows.find(row => row.id === "schedule-both")?.isActive).toBe(false);
		expect(rows.find(row => row.id === "schedule-both")?.originFinancialAccountId).toBeNull();
	});
	test("rolls back the whole transfer when a final write fails", async () => {
		await account("rollback-account");
		const invitation = await invite(["rollback-account"]);
		const preview = await previewAccountTransfer(recipient, invitation.id);
		await queryRaw(
			`CREATE FUNCTION fail_transfer_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."status"='ACCEPTED' THEN RAISE EXCEPTION 'Injected transfer failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_transfer_commit BEFORE UPDATE ON "AccountTransfer" FOR EACH ROW EXECUTE FUNCTION fail_transfer_commit()`,
		);
		try {
			await expect(
				respondAccountTransfer(recipient, invitation.id, "ACCEPTED", preview.version!),
			).rejects.toThrow("Injected transfer failure");
		} finally {
			await queryRaw(
				`DROP TRIGGER fail_transfer_commit ON "AccountTransfer"; DROP FUNCTION fail_transfer_commit()`,
			);
		}
		expect(
			(await queryRaw(`SELECT "userId" FROM "FinancialAccount" WHERE "id"='rollback-account'`))[0]
				?.userId,
		).toBe(sender);
		expect((await previewAccountTransfer(sender, invitation.id)).transfer.status).toBe("PENDING");
		await respondAccountTransfer(sender, invitation.id, "CANCELLED");
	});
	test("preserves account names, hidden state and group selection without merging", async () => {
		await account("duplicate-existing", recipient, "CHECKING", "Conta igual");
		await account("duplicate-moving", sender, "CHECKING", "Conta igual");
		await account("hidden-moving");
		await queryRaw(`UPDATE "FinancialAccount" SET "isHidden"=true WHERE "id"='hidden-moving'`);
		const invitation = await invite(["duplicate-moving", "hidden-moving"]);
		await account("created-after-invite");
		const preview = await previewAccountTransfer(recipient, invitation.id);
		expect(preview.accounts.find(row => row.id === "duplicate-moving")?.destinationName).toBe(
			"Conta igual (2)",
		);
		await accept(invitation.id);
		expect(
			(await queryRaw(`SELECT "userId" FROM "FinancialAccount" WHERE "id"='created-after-invite'`))[0]
				?.userId,
		).toBe(sender);
		expect(
			(await queryRaw(`SELECT "isHidden" FROM "FinancialAccount" WHERE "id"='hidden-moving'`))[0]
				?.isHidden,
		).toBe(true);
	});
	test("serializes concurrent acceptance and cancellation", async () => {
		await account("race-account");
		const invitation = await invite(["race-account"]);
		const preview = await previewAccountTransfer(recipient, invitation.id);
		const outcomes = await Promise.allSettled([
			respondAccountTransfer(recipient, invitation.id, "ACCEPTED", preview.version!),
			respondAccountTransfer(sender, invitation.id, "CANCELLED"),
		]);
		expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
		const final = (await previewAccountTransfer(sender, invitation.id)).transfer;
		const owner = (await queryRaw(`SELECT "userId" FROM "FinancialAccount" WHERE "id"='race-account'`))[0]
			?.userId;
		expect(owner).toBe(final.status === "ACCEPTED" ? recipient : sender);
	});
	test("sends channel results once and suppresses cancelled invitations", async () => {
		await account("notification-account");
		const invitation = await invite(["notification-account"]);
		await respondAccountTransfer(sender, invitation.id, "CANCELLED");
		const sent: string[] = [];
		await deliverNotifications({
			sendEmail: async email => {
				sent.push(email.url);
			},
			sendPush: async () => {},
		});
		expect(sent.some(url => url.includes(invitation.id))).toBe(false);
		const before = sent.length;
		await deliverNotifications({
			sendEmail: async email => {
				sent.push(email.url);
			},
			sendPush: async () => {},
		});
		expect(sent.length).toBe(before);
	});

	test("copies private institutions without depending on the sender catalogue", async () => {
		await queryRaw(
			`INSERT INTO "FinancialInstitution" ("id","userId","name","normalizedName","creditCardRules") VALUES ('private-bank',$1,'Banco privado','banco privado',$2::json)`,
			[sender, JSON.stringify({ workingDueDate: true })],
		);
		await queryRaw(
			`INSERT INTO "FinancialInstitutionProfile" ("id","institutionId","name","isDefault","creditCardRules") VALUES ('private-profile','private-bank','Perfil',true,$1::json)`,
			[JSON.stringify({ workingDueDate: true })],
		);
		await account("private-bank-account");
		await queryRaw(
			`UPDATE "FinancialAccount" SET "institutionId"='private-bank' WHERE "id"='private-bank-account'`,
		);
		const invitation = await invite(["private-bank-account"]);
		await accept(invitation.id);
		const [movedAccount] = await queryRaw(
			`SELECT account."institutionId",institution."userId" FROM "FinancialAccount" account JOIN "FinancialInstitution" institution ON institution."id"=account."institutionId" WHERE account."id"='private-bank-account'`,
		);
		expect(movedAccount?.institutionId).not.toBe("private-bank");
		expect(movedAccount?.userId).toBe(recipient);
		expect((await accountCardRules("private-bank-account")).workingDueDate).toBe(true);
	});
	test("keeps obligations at source while moving paid cash, used tags and pending imports", async () => {
		await account("obligation-account");
		await queryRaw(
			`INSERT INTO "Transaction" ("id","userId","amount","date","type","originFinancialAccountId","description") VALUES ('obligation-transaction',$1,20,'2026-01-01','EXPENSE','obligation-account','Despesa compartilhada')`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "DebtPerson" ("id","userId","name","normalizedName") VALUES ('obligation-person',$1,'Pessoa','pessoa')`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "DebtEvent" ("id","debtPersonId","createdByUserId","amount","effect") VALUES ('obligation-event','obligation-person',$1,20,20)`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "DebtTransactionLink" ("id","eventId","transactionId","userId","isCreator") VALUES ('obligation-link','obligation-event','obligation-transaction',$1,true)`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "Loan" ("id","userId","lender","principalAmount","interestRate","totalInstallments","installmentAmount","dueDay","startDate","firstDueDate") VALUES ('obligation-loan',$1,'Credor',100,0,4,25,5,'2026-01-01','2026-01-05')`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "LoanPayment" ("id","loanId","financialAccountId","installmentNumber","principalPaid","interestPaid","totalPaid","dueDate","paidDate","accountAmount") VALUES ('obligation-payment','obligation-loan','obligation-account',1,25,5,30,'2026-01-05','2026-01-05',35)`,
		);
		await queryRaw(
			`INSERT INTO "Category" ("id","userId","name") VALUES ('used-parent',$1,'Hierarquia usada'),('unused-category',$1,'Categoria privada')`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "Category" ("id","userId","name","parentId") VALUES ('used-category',$1,'Tag usada','used-parent')`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "TagAssignment" ("id","categoryId","entityType","entityId") VALUES ('used-tag','used-category','TRANSACTION','obligation-transaction')`,
		);
		await queryRaw(
			`INSERT INTO "TransactionImport" ("id","userId","financialAccountId","provider","fileName") VALUES ('obligation-import',$1,'obligation-account','GENERIC','extrato.csv')`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "TransactionImportItem" ("id","transactionImportId","amount","date","type","originFinancialAccountId") VALUES ('obligation-import-item','obligation-import',10,'2026-01-06','EXPENSE','obligation-account')`,
		);
		const before = (await getFinancialAccountBalances(["obligation-account"])).get("obligation-account");
		const invitation = await invite(["obligation-account"]);
		await accept(invitation.id);
		expect((await getFinancialAccountBalances(["obligation-account"])).get("obligation-account")).toBe(
			before,
		);
		expect((await queryRaw(`SELECT "userId" FROM "Loan" WHERE "id"='obligation-loan'`))[0]?.userId).toBe(
			sender,
		);
		expect(
			(
				await queryRaw(
					`SELECT "financialAccountId" FROM "LoanPayment" WHERE "id"='obligation-payment'`,
				)
			)[0]?.financialAccountId,
		).toBeNull();
		expect(
			(
				await queryRaw(
					`SELECT "createdByUserId","description" FROM "DebtEvent" WHERE "id"='obligation-event'`,
				)
			)[0],
		).toMatchObject({ createdByUserId: sender, description: "Despesa compartilhada" });
		expect(
			await queryRaw(`SELECT "id" FROM "DebtTransactionLink" WHERE "id"='obligation-link'`),
		).toHaveLength(0);
		expect(
			(await queryRaw(`SELECT "userId" FROM "TransactionImport" WHERE "id"='obligation-import'`))[0]
				?.userId,
		).toBe(recipient);
		const [tag] = await queryRaw(
			`SELECT category."userId",parent."userId" AS "parentOwner" FROM "TagAssignment" tag JOIN "Category" category ON category."id"=tag."categoryId" JOIN "Category" parent ON parent."id"=category."parentId" WHERE tag."id"='used-tag'`,
		);
		expect(tag).toMatchObject({ parentOwner: recipient, userId: recipient });
		expect(
			await queryRaw(`SELECT "id" FROM "Category" WHERE "name"='Categoria privada' AND "userId"=$1`, [
				recipient,
			]),
		).toHaveLength(0);
		await expect(
			queryRaw(
				`INSERT INTO "TagAssignment" ("id","categoryId","entityType","entityId") VALUES ('stale-tag','used-category','TRANSACTION','obligation-transaction')`,
			),
		).rejects.toThrow();
		await expect(
			queryRaw(
				`UPDATE "FinancialAccount" SET "transferredProfileContext"='{}'::json WHERE "id"='obligation-account'`,
			),
		).rejects.toThrow();
	});
	test("detaches provider bindings and refuses late synchronization references", async () => {
		await account("provider-account");
		await queryRaw(
			`INSERT INTO "OpenFinanceConnection" ("id","userId","itemId","bankName","status","remoteAccounts") VALUES ('provider-connection',$1,'remote-item','Banco','UPDATED','[]')`,
			[sender],
		);
		await queryRaw(
			`INSERT INTO "OpenFinanceBinding" ("id","connectionId","remoteAccountId","financialAccountId") VALUES ('provider-binding','provider-connection','remote-account','provider-account')`,
		);
		const invitation = await invite(["provider-account"]);
		await accept(invitation.id);
		expect(
			(
				await queryRaw(
					`SELECT "paused","financialAccountId" FROM "OpenFinanceBinding" WHERE "id"='provider-binding'`,
				)
			)[0],
		).toMatchObject({ financialAccountId: null, paused: true });
		expect(
			(
				await queryRaw(
					`SELECT "userId" FROM "OpenFinanceConnection" WHERE "id"='provider-connection'`,
				)
			)[0]?.userId,
		).toBe(sender);
		await expect(
			queryRaw(
				`UPDATE "OpenFinanceBinding" SET "financialAccountId"='provider-account',"paused"=false WHERE "id"='provider-binding'`,
			),
		).rejects.toThrow();
	});
});
