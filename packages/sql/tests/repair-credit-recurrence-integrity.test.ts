import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";
import contract from "../migrations/snapshots/489fa825bbec65c03cbedcfb5f9392b3e81f364964be9deadd99a8e829aa13cf/contract.json";
import { assertLocalRecurrenceTestUrl, installContractFixture } from "./contract-fixture";

const url = requireFixtureUrl("RECURRENCE_TEST_URL");
const repair = readFileSync(
	new URL("../scripts/repair-credit-recurrence-integrity.sql", import.meta.url),
	"utf8",
);

describe("credit recurrence integrity repair", () => {
	test("repairs retired table reference while retaining ownership and installment checks", async () => {
		assertLocalRecurrenceTestUrl(url!);
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await installContractFixture(client, contract);
			// Reproduce the actual historical trigger after column renames and category removal.
			const historical = readFileSync(
				new URL(
					"../migrations/app/20260928T1340_activate_normalized_credit_ledger/migration.ts",
					import.meta.url,
				),
				"utf8",
			);
			const integrity = historical.match(
				/CREATE FUNCTION enforce_credit_purchase_integrity\(\)[\s\S]*?END \$integrity\$;/,
			)?.[0];
			if (!integrity) throw new Error("Historical integrity fixture missing");
			await client.query(
				integrity
					.replaceAll("subscriptionId", "recurrenceId")
					.replace(
						'(p."categoryId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Category" x WHERE x."id" = p."categoryId" AND x."userId" = owner_id)) OR\n ',
						"",
					),
			);
			await client.query(
				`CREATE CONSTRAINT TRIGGER "CreditPurchaseRecord_integrity" AFTER INSERT OR UPDATE ON "CreditPurchaseRecord" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_credit_purchase_integrity();`,
			);
			await client.query(`
INSERT INTO "user" ("id","email","name") VALUES ('owner','owner@example.test','Owner'),('other','other@example.test','Other');
INSERT INTO "FinancialAccount" ("id","userId","type") VALUES ('card-account','owner','CREDIT_CARD');
INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","statementDay","dueDay") VALUES ('card','card-account',1000,15,25);
INSERT INTO "Recurrence" ("id","userId","name","amount","movement","unit","startDate","creditCardId") VALUES ('r','owner','Purchase',3.99,'CARD_PURCHASE','MONTH','2026-01-01','card'),('foreign-r','other','Other',3.99,'CARD_PURCHASE','MONTH','2026-01-01','card');
`);
			const purchase = async (recurrenceId: string, planned = 3.99) => {
				await client.query(
					'INSERT INTO "CreditPurchaseRecord" ("id","userId","creditCardId","description","totalAmount","purchaseDate","recurrenceId","recurrenceOccurrenceDate") VALUES ($1,$2,$3,$4,$5,$6,$7,$6)',
					["p", "owner", "card", "Gabrita Off", 3.99, "2026-01-27", recurrenceId],
				);
				await client.query(
					'INSERT INTO "CreditInstallmentPlan" ("purchaseId","number","amount") VALUES ($1,1,$2)',
					["p", planned],
				);
				await client.query("SET CONSTRAINTS ALL IMMEDIATE");
			};
			await client.query("SAVEPOINT broken_trigger");
			await expect(purchase("r")).rejects.toThrow('relation "Subscription" does not exist');
			await client.query("ROLLBACK TO SAVEPOINT broken_trigger");
			await client.query(repair);
			await client.query(repair);
			const definition = (
				await client.query(
					"SELECT pg_get_functiondef('enforce_credit_purchase_integrity()'::regprocedure) AS definition",
				)
			).rows[0].definition;
			expect(definition).not.toContain('"Subscription"');
			expect(definition).toContain('"Recurrence"');
			await client.query("SAVEPOINT valid_purchase");
			await purchase("r");
			expect(
				(await client.query('SELECT "recurrenceId" FROM "CreditPurchaseRecord"')).rows[0]
					.recurrenceId,
			).toBe("r");
			await client.query("ROLLBACK TO SAVEPOINT valid_purchase");
			await client.query("SAVEPOINT ownership_check");
			await expect(purchase("foreign-r")).rejects.toThrow("Purchase metadata belongs to another owner");
			await client.query("ROLLBACK TO SAVEPOINT ownership_check");
			await client.query("SAVEPOINT plan_check");
			await expect(purchase("r", 2)).rejects.toThrow("Purchase plan must match total");
			await client.query("ROLLBACK TO SAVEPOINT plan_check");
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	}, 30000);
});
