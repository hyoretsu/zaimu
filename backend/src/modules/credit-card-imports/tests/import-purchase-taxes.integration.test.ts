import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";

const testUrl = requireFixtureUrl("NORMALIZED_PURCHASE_TEST_URL");
let client: Client;
let associate: typeof import("../application/associate-import-tax").associateImportedTax;
let approve: typeof import("../application/import-service").approveItems;
beforeAll(async () => {
	process.env.DATABASE_URL = testUrl;
	process.env.REDIS_URL = requireFixtureUrl("CACHE_TEST_REDIS_URL");
	process.env.BETTER_AUTH_SECRET = "local-import-tax-tests-secret-123456789";
	process.env.BETTER_AUTH_URL = "http://localhost:3333";
	associate = (await import("../application/associate-import-tax")).associateImportedTax;
	approve = (await import("../application/import-service")).approveItems;
	client = new Client({ connectionString: testUrl });
	await client.connect();
	await client.query(`
 INSERT INTO "user" ("id", "email", "name") VALUES ('import-tax-user', 'import-tax@example.test', 'Teste');
 INSERT INTO "FinancialInstitution" ("id", "userId", "name", "normalizedName") VALUES ('import-tax-bank', 'import-tax-user', 'Banco', 'banco');
 INSERT INTO "FinancialAccount" ("id", "userId", "name", "type", "institutionId") VALUES ('import-tax-account', 'import-tax-user', 'Cartão', 'CREDIT_CARD', 'import-tax-bank');
 INSERT INTO "CreditCard" ("id", "financialAccountId", "creditLimit", "statementDay", "dueDay") VALUES ('import-tax-card', 'import-tax-account', 5000, 10, 20);
 INSERT INTO "CreditCardImport" ("id", "userId", "creditCardId", "provider", "fileName", "statementDate", "dueDate") VALUES ('import-tax-batch', 'import-tax-user', 'import-tax-card', 'INTER', 'invoice.pdf', '2026-06-10', '2026-06-20');
 INSERT INTO "CreditCardImportItem" ("id", "creditCardImportId", "externalId", "purchaseDate", "description", "totalAmount", "installmentAmount", "isStatementCharge", "metadataMissing") VALUES
 ('import-tax-purchase', 'import-tax-batch', 'import-tax-original', '2026-06-05', 'Task Bar Hero DLCs', 52.77, 52.77, false, '[]'::json),
 ('import-tax-source', 'import-tax-batch', 'import-tax-iof', '2026-06-08', 'IOF', 1.80, 1.80, true, '[]'::json);
 `);
});
afterAll(async () => {
	await client?.query(`DELETE FROM "user" WHERE "id"='import-tax-user'`);
	await client?.end();
	await (await import("~/shared/infra/sql")).closeDatabase();
});

test("import builder dates retain UTC instants and nullable amounts across time zones", async () => {
	const previousTimeZone = process.env.TZ;
	try {
		const { getImport } = await import("../application/import-service");
		for (const timeZone of ["UTC", "America/Recife"]) {
			process.env.TZ = timeZone;
			const imported = await getImport("import-tax-user", "import-tax-batch");
			expect(imported.statementDate.toISOString()).toBe("2026-06-10T00:00:00.000Z");
			expect(imported.dueDate.toISOString()).toBe("2026-06-20T00:00:00.000Z");
			expect(imported.reportedPreviousBalance).toBeNull();
		}
	} finally {
		if (previousTimeZone === undefined) delete process.env.TZ;
		else process.env.TZ = previousTimeZone;
	}
});

test("association enforces ownership and rejects self-linking without losing rows", async () => {
	await expect(
		associate("another-user", "import-tax-batch", "import-tax-source", "import-tax-purchase"),
	).rejects.toThrow();
	await expect(
		associate("import-tax-user", "import-tax-batch", "import-tax-source", "import-tax-source"),
	).rejects.toThrow();
	expect(
		(
			await client.query(
				`SELECT "id" FROM "CreditCardImportItem" WHERE "creditCardImportId"='import-tax-batch'`,
			)
		).rowCount,
	).toBe(2);
});

test("association persists tax and approval creates one purchase, no statement charge", async () => {
	await associate("import-tax-user", "import-tax-batch", "import-tax-source", "import-tax-purchase", {
		amount: 1.85,
		name: "IOF INTERNACIONAL",
	});
	const pending = (
		await client.query(
			`SELECT * FROM "CreditCardImportItem" WHERE "creditCardImportId"='import-tax-batch'`,
		)
	).rows;
	expect(pending).toHaveLength(1);
	expect(Number(pending[0].installmentAmount)).toBe(54.62);
	expect(pending[0].taxes).toEqual([{ amount: 1.85, name: "IOF INTERNACIONAL" }]);
	expect(pending[0].taxSourceExternalIds).toEqual(["import-tax-iof"]);
	await approve("import-tax-user", "import-tax-batch", "import-tax-purchase");
	const purchases = (
		await client.query(`SELECT * FROM "CreditPurchaseRecord" WHERE "creditCardId"='import-tax-card'`)
	).rows;
	expect(purchases).toHaveLength(1);
	expect(Number(purchases[0].totalAmount)).toBe(54.62);
	expect(Number(purchases[0].originalAmount)).toBe(52.77);
	expect(purchases[0].fees).toEqual([{ amount: 1.85, name: "IOF INTERNACIONAL", type: "FIXED" }]);
	expect(
		(
			await client.query(
				`SELECT ch.* FROM "CreditStatementCharge" ch JOIN "CreditCardStatement" s ON s."id"=ch."statementId" WHERE s."creditCardId"='import-tax-card' `,
			)
		).rowCount,
	).toBe(0);
	expect(
		(
			await client.query(
				`SELECT * FROM "CreditPurchaseImportIdentity" WHERE "externalId"='import-tax-iof'`,
			)
		).rowCount,
	).toBe(1);
});

test("tax can be linked after purchase approval without another purchase or charge", async () => {
	const purchase = (
		await client.query(`SELECT "id" FROM "CreditPurchaseRecord" WHERE "creditCardId"='import-tax-card'`)
	).rows[0];
	await client.query(`
		INSERT INTO "CreditCardImport" ("id", "userId", "creditCardId", "provider", "fileName", "statementDate", "dueDate") VALUES ('approved-tax-batch', 'import-tax-user', 'import-tax-card', 'INTER', 'tax.pdf', '2026-06-10', '2026-06-20');
		INSERT INTO "CreditCardImportItem" ("id", "creditCardImportId", "externalId", "purchaseDate", "description", "totalAmount", "installmentAmount", "isStatementCharge", "metadataMissing") VALUES ('approved-tax-source', 'approved-tax-batch', 'approved-tax-iof', '2026-06-08', 'IOF', 2, 2, true, '[]'::json);
	`);
	await expect(
		associate("another-user", "approved-tax-batch", "approved-tax-source", purchase.id),
	).rejects.toThrow();
	await client.query(
		`UPDATE "CreditCardImport" SET "statementDate"='2026-07-10', "dueDate"='2026-07-20' WHERE "id"='approved-tax-batch'`,
	);
	await expect(
		associate("import-tax-user", "approved-tax-batch", "approved-tax-source", purchase.id),
	).rejects.toThrow();
	await client.query(
		`UPDATE "CreditCardImport" SET "statementDate"='2026-06-10', "dueDate"='2026-06-20' WHERE "id"='approved-tax-batch'`,
	);
	await associate("import-tax-user", "approved-tax-batch", "approved-tax-source", purchase.id);
	expect(
		(await client.query(`SELECT "status" FROM "CreditCardImport" WHERE "id"='approved-tax-batch'`))
			.rows[0].status,
	).toBe("APPROVED");
	await expect(
		associate("import-tax-user", "approved-tax-batch", "approved-tax-source", purchase.id),
	).rejects.toThrow();
	const purchases = (
		await client.query(`SELECT * FROM "CreditPurchaseRecord" WHERE "creditCardId"='import-tax-card'`)
	).rows;
	expect(purchases).toHaveLength(1);
	expect(Number(purchases[0].totalAmount)).toBe(56.62);
	expect(Number(purchases[0].originalAmount)).toBe(52.77);
	expect(purchases[0].fees).toEqual([
		{ amount: 1.85, name: "IOF INTERNACIONAL", type: "FIXED" },
		{ amount: 2, name: "IOF", type: "FIXED" },
	]);
	const installments = (
		await client.query(`SELECT * FROM "CreditInstallmentRecord" WHERE "purchaseId"=$1`, [purchase.id])
	).rows;
	expect(installments).toHaveLength(1);
	expect(Number(installments[0].amount)).toBe(56.62);
	expect(
		(
			await client.query(
				`SELECT * FROM "CreditPurchaseImportIdentity" WHERE "externalId"='approved-tax-iof' AND "purchaseId"=$1`,
				[purchase.id],
			)
		).rowCount,
	).toBe(1);
	expect(
		(await client.query(`SELECT * FROM "CreditCardImportItem" WHERE "id"='approved-tax-source'`))
			.rowCount,
	).toBe(0);
});

test("tax changes only the matching installment of an existing purchase", async () => {
	const { mutateCreditBook, readCreditBook } =
		await import("~/modules/creditCards/application/normalized-credit-book");
	const { newBookPurchase } = await import("@zaimu/finance/credit-book");
	const id = await mutateCreditBook(
		"import-tax-user",
		"import-tax-card",
		book =>
			newBookPurchase(book, {
				description: "Compra parcelada",
				installments: 3,
				purchaseDate: "2026-05-05",
				totalAmount: 90,
			}).id,
	);
	await client.query(
		`INSERT INTO "CreditCardImportItem" ("id", "creditCardImportId", "externalId", "purchaseDate", "description", "totalAmount", "installmentAmount", "isStatementCharge", "metadataMissing") VALUES ('installment-tax-source', 'approved-tax-batch', 'installment-tax-iof', '2026-06-08', 'IOF', 2, 2, true, '[]'::json)`,
	);
	await associate("import-tax-user", "approved-tax-batch", "installment-tax-source", id);
	const book = await readCreditBook("import-tax-user", "import-tax-card");
	const purchase = book.purchases.find(p => p.id === id)!;
	expect(purchase.totalAmountCents).toBe(9200);
	expect(purchase.installmentAmountsCents).toEqual([3000, 3200, 3000]);
	expect(
		book.installments
			.filter(i => i.purchaseId === id)
			.toSorted((a, b) => a.number - b.number)
			.map(i => i.amountCents),
	).toEqual([3000, 3200, 3000]);
});
