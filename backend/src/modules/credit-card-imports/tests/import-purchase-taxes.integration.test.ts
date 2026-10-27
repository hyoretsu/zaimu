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
