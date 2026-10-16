import { expect, test } from "bun:test";
import type { RawQuery } from "~/modules/creditCards/application/normalized-statement-replay";
import { reconcileBalanceAdjustments } from "./balance-adjustment-reconciliation";

test("reconciliation locks checkpoints, compares full ledger without current point, and preserves one-cent differences", async () => {
	const deleted: string[] = [];
	const checkpoints = [
		{ balance: 100, currency: "BRL", date: "2026-01-02", financialAccountId: "account", id: "first" },
		{ balance: 150, currency: "BRL", date: "2026-01-03", financialAccountId: "account", id: "second" },
		{ balance: 180.01, currency: "BRL", date: "2026-01-04", financialAccountId: "account", id: "third" },
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
		const balance = values[2] === "first" ? 100.004 : values[2] === "second" ? 150 : 180;
		return [{ accountId: "account", balance }] as T[];
	};
	expect(await reconcileBalanceAdjustments(query, "user", "account")).toEqual(["first", "second"]);
	expect(deleted).toEqual(["first", "second"]);
});
