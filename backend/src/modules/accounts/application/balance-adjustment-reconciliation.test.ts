import { expect, spyOn, test } from "bun:test";
import type { RawQuery } from "~/modules/creditCards/application/normalized-statement-replay";
import * as sql from "~/shared/infra/sql";
import { reconcileBalanceAdjustments } from "./balance-adjustment-reconciliation";

test("reconciliation locks checkpoints, compares full ledger without current point, and preserves one-cent differences", async () => {
	const deleted: string[] = [];
	const checkpoints = [
		{ assetCode: "BRL", balance: "100", date: "2026-01-02", financialAccountId: "account", id: "first" },
		{ assetCode: "BRL", balance: "150", date: "2026-01-03", financialAccountId: "account", id: "second" },
		{
			assetCode: "BRL",
			balance: "180.01",
			date: "2026-01-04",
			financialAccountId: "account",
			id: "third",
		},
	];
	const query: RawQuery = async <T>(sql: string, values: unknown[] = []) => {
		if (sql.includes("FOR UPDATE")) {
			expect(sql).toContain('ORDER BY "date"');
			return checkpoints as T[];
		}
		if (sql.startsWith("DELETE")) {
			deleted.push(String(values[0]));
			return [] as T[];
		}
		expect(sql).toContain('checkpoint."id" <> $3');
		if (values[2] === "second") expect(deleted).toEqual(["first"]);
		const balance = values[2] === "first" ? "100.004" : values[2] === "second" ? "150" : "180";
		return [{ accountId: "account", assetCode: "BRL", balance }] as T[];
	};
	const assetQuery = spyOn(sql, "queryRawDecimal").mockImplementation(
		async <T>() => [{ assetCode: "BRL", decimals: 2, kind: "FIAT" }] as T[],
	);
	try {
		expect(await reconcileBalanceAdjustments(query, "user", "account")).toEqual(["first", "second"]);
		expect(deleted).toEqual(["first", "second"]);
		expect(assetQuery).toHaveBeenCalledTimes(3);
		for (const [, values] of assetQuery.mock.calls) {
			expect(values).toEqual(["account", "BRL", "user", false]);
		}
	} finally {
		assetQuery.mockRestore();
	}
});

test("reconciliation removes exact native crypto checkpoints but preserves a one-wei difference", async () => {
	const deleted: string[] = [];
	const checkpoints = [
		{
			assetCode: "ETH",
			balance: "1.000000000000000001",
			date: "2026-01-02",
			financialAccountId: "account",
			id: "exact",
		},
		{
			assetCode: "ETH",
			balance: "1.000000000000000002",
			date: "2026-01-03",
			financialAccountId: "account",
			id: "one-wei",
		},
	];
	const query: RawQuery = async <T>(statement: string, values: unknown[] = []) => {
		if (statement.includes("FOR UPDATE")) return checkpoints as T[];
		if (statement.startsWith("DELETE")) {
			deleted.push(String(values[0]));
			return [] as T[];
		}
		expect(statement).toContain('checkpoint."id" <> $3');
		return [
			{ accountId: "account", assetCode: "BRL", balance: "999" },
			{ accountId: "account", assetCode: "ETH", balance: "1.000000000000000001" },
		] as T[];
	};
	const assetQuery = spyOn(sql, "queryRawDecimal").mockImplementation(
		async <T>() => [{ assetCode: "ETH", decimals: 18, kind: "CRYPTO" }] as T[],
	);
	try {
		expect(await reconcileBalanceAdjustments(query, "user", "account")).toEqual(["exact"]);
		expect(deleted).toEqual(["exact"]);
		expect(assetQuery).toHaveBeenCalledTimes(2);
		for (const [, values] of assetQuery.mock.calls) {
			expect(values).toEqual(["account", "ETH", "user", false]);
		}
	} finally {
		assetQuery.mockRestore();
	}
});
