import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { monetaryBalancesSql } from "../../../backend/src/modules/accounts/application/monetary-balances-sql";
import { yieldMovementsSql } from "../../../backend/src/modules/accounts/application/yield-movements-sql";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";
import contract from "../migrations/snapshots/5c0c1d3b21183e779bd6966ec7d962a3588da1a7991ca905a2c1a6e05645b259/contract.json";
import { installContractFixture } from "./contract-fixture";

const url = requireFixtureUrl("DATABASE_TEST_URL");
const cutover = readFileSync(
	new URL("../migrations/app/20261105T1246_multi_asset_wallet_final/cutover.sql", import.meta.url),
	"utf8",
);
async function fixture(run: (client: Client) => Promise<void>) {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		await client.query("BEGIN");
		await installContractFixture(client, contract);
		await client.query(`
INSERT INTO "user" ("id","email","name") VALUES ('owner','owner@example.test','Owner'),('other','other@example.test','Other');
INSERT INTO "FinancialAccount" ("id","userId","name","currency","balance","type") VALUES
 ('a','owner','A','BRL',123.45,'CHECKING'),('b','owner','B','USD',0,'CHECKING'),('reward','owner','Reward','BRL',0,'REWARDS'),('card-account','owner','Card','BRL',0,'CREDIT_CARD'),('other','other','Other','BRL',0,'CHECKING');
INSERT INTO "RewardsAccount" ("financialAccountId","kind","initialBalance") VALUES ('reward','CASHBACK',100);
INSERT INTO "BalanceAdjustment" ("id","userId","financialAccountId","date","currency","balance") VALUES ('adjust','owner','a','2026-01-02','JPY',900);
INSERT INTO "FinancialAccountYield" ("id","financialAccountId","date","currency","amount","kind") VALUES ('yield','a','2026-01-03','JPY',2,'MANUAL');
INSERT INTO "Transaction" ("id","userId","type","amount","originalAmount","currency","bookingCurrency","destinationAmount","destinationCurrency","originFinancialAccountId","destinationFinancialAccountId","date") VALUES
 ('foreign','owner','TRANSFER',50,10,'USD','BRL',10,'USD','a','b','2026-01-01'),
 ('income','owner','INCOME',20,20,'USD','USD',20,'USD',NULL,'a','2026-01-01'),
 ('other','other','INCOME',999,999,'BRL','BRL',999,'BRL',NULL,'other','2026-01-01');
INSERT INTO "CreditCard" ("id","financialAccountId","currency","creditLimit","statementDay","dueDay") VALUES ('card','card-account','USD',1000,10,20);
INSERT INTO "Transaction" ("id","userId","type","amount","currency","bookingCurrency","paymentAmount","paymentCurrency","paymentCreditCardId","originFinancialAccountId","date") VALUES ('payment','owner','EXPENSE',30,'BRL','BRL',6,'USD','card','a','2026-01-01');
INSERT INTO "CreditPurchaseRecord" ("id","userId","creditCardId","description","purchaseDate","totalAmount","cashbackAccountId","cashbackAmount") VALUES ('purchase','owner','card','Purchase','2026-01-01',10,'reward',2);
INSERT INTO "DetachedRewardCredit" ("id","financialAccountId","amount","date") VALUES ('detached','reward',3,'2026-01-01');
INSERT INTO "Loan" ("id","userId","currency","lender","principalAmount","interestRate","totalInstallments","installmentAmount","dueDay","startDate","firstDueDate") VALUES ('loan','owner','EUR','Lender',7,0,1,7,1,'2026-01-01','2026-01-01');
INSERT INTO "LoanPayment" ("id","loanId","financialAccountId","currency","principalPaid","interestPaid","totalPaid","dueDate","paidDate","installmentNumber") VALUES ('loan-payment','loan','a','EUR',7,0,7,'2026-01-01','2026-01-01',1);
`);
		await run(client);
	} finally {
		await client.query("ROLLBACK");
		await client.end();
	}
}

describe("multi-asset wallet migration and ledger", () => {
	test(
		"preserves caches and historical denominations before dropping scalar fields",
		() =>
			fixture(async client => {
				await client.query(cutover);
				expect(
					(
						await client.query(
							`SELECT "balance"::text AS balance FROM "FinancialAccountAsset" WHERE "financialAccountId"='a' AND "assetCode"='BRL'`,
						)
					).rows[0].balance,
				).toBe("123.450000000000000000");
				expect(
					(await client.query(`SELECT "assetCode" FROM "BalanceAdjustment" WHERE "id"='adjust'`))
						.rows[0].assetCode,
				).toBe("JPY");
				expect(
					(await client.query(`SELECT "assetCode" FROM "FinancialAccountYield" WHERE "id"='yield'`))
						.rows[0].assetCode,
				).toBe("JPY");
				expect(
					(
						await client.query(
							`SELECT "currency","accountCurrency","accountAmount"::text FROM "LoanPayment" WHERE "id"='loan-payment'`,
						)
					).rows[0],
				).toMatchObject({ accountAmount: "7.000000", accountCurrency: "BRL", currency: "EUR" });
				expect(
					(
						await client.query(
							`SELECT "cashbackCurrency" FROM "CreditPurchaseRecord" WHERE "id"='purchase'`,
						)
					).rows[0].cashbackCurrency,
				).toBe("BRL");
				expect(
					(
						await client.query(
							`SELECT column_name FROM information_schema.columns WHERE table_name='FinancialAccount' AND column_name IN ('currency','balance')`,
						)
					).rows,
				).toEqual([]);
				expect(
					(await client.query(`SELECT "yieldCurrency" FROM "FinancialAccount" WHERE "id"='a'`))
						.rows[0].yieldCurrency,
				).toBe("BRL");
			}),
		60000,
	);
	test(
		"keeps original, booked, card-payment and destination values in their own denominations",
		() =>
			fixture(async client => {
				await client.query(cutover);
				await client.query(
					`INSERT INTO "FinancialAccountAsset" ("financialAccountId","assetCode") VALUES ('reward','USD')`,
				);
				const rows = (await client.query(monetaryBalancesSql, ["owner", ["2026-01-03"]])).rows;
				const balance = (account: string, asset: string) =>
					rows.find(row => row.accountId === account && row.assetCode === asset)?.balance;
				expect(Number(balance("a", "BRL"))).toBe(-87);
				expect(Number(balance("a", "USD"))).toBe(20);
				expect(Number(balance("b", "USD"))).toBe(10);
				expect(Number(balance("a", "JPY"))).toBe(902);
				expect(Number(balance("reward", "BRL"))).toBe(105);
				expect(Number(balance("reward", "USD"))).toBe(0);
				expect(rows.some(row => row.accountId === "other")).toBe(false);
			}),
		60000,
	);
	test(
		"preserves 18-place quantities, gas and independent checkpoints",
		() =>
			fixture(async client => {
				await client.query(cutover);
				await client.query(`
INSERT INTO "Asset" ("code","kind","name","decimals") VALUES ('ETH','CRYPTO','Ether',18),('USDC','CRYPTO','USD Coin',6);
INSERT INTO "FinancialAccountAsset" ("financialAccountId","assetCode") VALUES ('a','ETH'),('a','USDC');
INSERT INTO "Transaction" ("id","userId","type","amount","currency","bookingCurrency","destinationFinancialAccountId","date") VALUES ('crypto-income','owner','INCOME',0.123456789012345678,'ETH','ETH','a','2026-01-01');
INSERT INTO "Transaction" ("id","userId","type","amount","currency","bookingCurrency","originFinancialAccountId","fees","date") VALUES ('gas','owner','EXPENSE',1,'USDC','USDC','a','[{"type":"FIXED","amount":"0.000000000000000001","assetCode":"ETH"}]','2026-01-01');
INSERT INTO "BalanceAdjustment" ("id","userId","financialAccountId","assetCode","balance","date") VALUES ('eth-checkpoint','owner','a','ETH',0.000000000000000099,'2026-01-02');
INSERT INTO "Transaction" ("id","userId","type","amount","currency","bookingCurrency","destinationFinancialAccountId","date") VALUES ('one-wei','owner','INCOME',0.000000000000000001,'ETH','ETH','a','2026-01-03');
`);
				const rows = (
					await client.query(monetaryBalancesSql, ["owner", ["2026-01-01", "2026-01-03"]])
				).rows;
				expect(
					rows.find(
						row => row.accountId === "a" && row.assetCode === "ETH" && row.date === "2026-01-01",
					)?.balance,
				).toBe("0.123456789012345677");
				expect(
					rows.find(
						row => row.accountId === "a" && row.assetCode === "ETH" && row.date === "2026-01-03",
					)?.balance,
				).toBe("0.000000000000000100");
				expect(
					Number(
						rows.find(
							row =>
								row.accountId === "a" && row.assetCode === "JPY" && row.date === "2026-01-03",
						)?.balance,
					),
				).toBe(902);
			}),
		60000,
	);
	test(
		"fiat yield replay preserves side identity for swaps, zero and signed historical values",
		() =>
			fixture(async client => {
				await client.query(cutover);
				await client.query(`INSERT INTO "Transaction" ("id","userId","type","amount","currency","bookingCurrency","destinationAmount","destinationCurrency","originFinancialAccountId","destinationFinancialAccountId","date") VALUES
 ('swap','owner','TRANSFER',2,'USD','USD',10,'BRL','a','a','2026-01-04'),
 ('signed','owner','TRANSFER',-3,'BRL','BRL',-0.6,'USD','a','a','2026-01-04'),
 ('zero','owner','TRANSFER',0,'BRL','BRL',0,'BRL','a','a','2026-01-04');`);
				const rows = (await client.query(yieldMovementsSql, [["a"]])).rows;
				expect(rows.find(row => row.id === "swap:DESTINATION:a")).toMatchObject({
					destinationFinancialAccountId: "a",
					originFinancialAccountId: null,
				});
				expect(rows.some(row => row.id === "swap:ORIGIN:a")).toBe(false);
				expect(rows.find(row => row.id === "signed:ORIGIN:a")).toMatchObject({
					destinationFinancialAccountId: null,
					originFinancialAccountId: "a",
				});
				expect(Number(rows.find(row => row.id === "signed:ORIGIN:a")?.amount)).toBe(-3);
				expect(
					rows
						.filter(row => row.id.startsWith("zero:"))
						.map(row => row.id)
						.sort(),
				).toEqual(["zero:DESTINATION:a", "zero:ORIGIN:a"]);
			}),
		60000,
	);
	test(
		"cashback accrues only on complete snapshot periods and resumes after checkpoints",
		() =>
			fixture(async client => {
				await client.query(cutover);
				await client.query(`
DELETE FROM "DetachedRewardCredit";
UPDATE "RewardsAccount" SET "initialBalance"=0 WHERE "financialAccountId"='reward';
UPDATE "CreditPurchaseRecord" SET "cashbackAmount"=100,"cashbackYieldPeriod"='MONTHLY',"cashbackYieldReferenceRate"=10,"cashbackYieldReferencePercentage"=100 WHERE id='purchase';
INSERT INTO "FinancialAccountAsset" ("financialAccountId","assetCode") VALUES ('reward','USD');
INSERT INTO "DetachedRewardCredit" (id,"financialAccountId","assetCode",amount,date,"yieldPeriod","yieldReferenceRate","yieldReferencePercentage") VALUES ('annual','reward','USD',200,'2026-01-01','YEARLY',5,100);
INSERT INTO "BalanceAdjustment" (id,"userId","financialAccountId","assetCode",balance,date) VALUES ('reward-checkpoint','owner','reward','BRL',500,'2026-02-01');
`);
				const rows = (
					await client.query(
						`SELECT ledger.*,balance::numeric=CASE
 WHEN currency='USD' AND date<'2027-01-01' THEN 200
 WHEN currency='USD' THEN 210
 WHEN date<'2026-02-01' THEN 100
 WHEN date<'2026-03-01' THEN 500
 ELSE 511 END AS correct FROM (${monetaryBalancesSql}) ledger`,
						[
							"owner",
							[
								"2026-01-31",
								"2026-02-01",
								"2026-02-28",
								"2026-03-01",
								"2026-12-31",
								"2027-01-01",
							],
						],
					)
				).rows;
				// Only assert monthly dates before later anniversaries; annual USD remains independent.
				const rewards = rows.filter(
					row => row.accountId === "reward" && (row.currency === "USD" || row.date <= "2026-03-01"),
				);
				expect(rewards).toHaveLength(10);
				expect(rewards.every(row => row.correct)).toBe(true);
			}),
		60000,
	);
	test(
		"crypto cashback refunds conserve minimal units cumulatively and checkpoints stay asset-local",
		() =>
			fixture(async client => {
				await client.query(cutover);
				await client.query(`
INSERT INTO "Asset" (code,kind,name,decimals) VALUES ('ETH','CRYPTO','Ether',18);
INSERT INTO "FinancialAccountAsset" ("financialAccountId","assetCode") VALUES ('reward','ETH');
UPDATE "CreditPurchaseRecord" SET "totalAmount"=3,"cashbackCurrency"='ETH',"cashbackAmount"=0.000000000000000005 WHERE id='purchase';
INSERT INTO "CreditCardStatement" (id,"creditCardId","statementDate","dueDate") VALUES ('refund-statement','card','2026-01-10','2026-01-20');
INSERT INTO "CreditRefundRecord" (id,"purchaseId","statementId",policy,amount,"creditDate") VALUES ('refund-one','purchase','refund-statement','KEEP_INSTALLMENTS',1,'2026-01-02'),('refund-two','purchase','refund-statement','KEEP_INSTALLMENTS',1,'2026-01-03'),('refund-three','purchase','refund-statement','KEEP_INSTALLMENTS',1,'2026-01-04');
INSERT INTO "BalanceAdjustment" (id,"userId","financialAccountId","assetCode",balance,date) VALUES ('crypto-reward-checkpoint','owner','reward','ETH',0.000000000000000010,'2026-01-03');
`);
				const rows = (
					await client.query(monetaryBalancesSql, [
						"owner",
						["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"],
					])
				).rows;
				const eth = rows.filter(row => row.accountId === "reward" && row.assetCode === "ETH");
				expect(eth.map(row => row.balance)).toEqual([
					"0.000000000000000005",
					"0.000000000000000003",
					"0.000000000000000010",
					"0.000000000000000008",
				]);
				expect(
					rows
						.filter(row => row.accountId === "reward" && row.assetCode === "BRL")
						.every(row => Number(row.balance) === 103),
				).toBe(true);
				await client.query(`DELETE FROM "BalanceAdjustment" WHERE id='crypto-reward-checkpoint'`);
				const final = (await client.query(monetaryBalancesSql, ["owner", ["2026-01-04"]])).rows;
				expect(
					final.find(row => row.accountId === "reward" && row.assetCode === "ETH")?.balance,
				).toBe("0.000000000000000000");
			}),
		60000,
	);
	test(
		"late failure rolls the entire cutover back",
		() =>
			fixture(async client => {
				await client.query("SAVEPOINT before_cutover");
				await client.query(cutover);
				await expect(client.query("SELECT 1/0")).rejects.toThrow("division by zero");
				await client.query("ROLLBACK TO SAVEPOINT before_cutover");
				expect(
					(
						await client.query(
							`SELECT "currency","balance"::text FROM "FinancialAccount" WHERE "id"='a'`,
						)
					).rows[0],
				).toEqual({ balance: "123.450000", currency: "BRL" });
				expect(
					(await client.query(`SELECT to_regclass('public."Asset"') AS name`)).rows[0].name,
				).toBeNull();
			}),
		60000,
	);
});
