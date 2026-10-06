import { monetaryBalancesSql } from "../src/modules/accounts/application/monetary-balances-sql";

const url = new URL(process.env.PERFORMANCE_DATABASE_URL ?? "");
if (url.hostname !== "127.0.0.1" || url.port !== "55495" || url.pathname !== "/zaimu_performance")
	throw new Error("Dedicated local performance database required");
process.env.DATABASE_URL = url.href;
const { closeDatabase, queryRaw, withRawTransaction } = await import("sql");
const baseline = await Bun.file(new URL("./fixtures/monetary-balances-baseline.sql", import.meta.url)).text();
const adversarial = await Bun.file(
	new URL("./fixtures/monetary-balances-adversarial.sql", import.meta.url),
).text();
const dates = [
	"2021-01-01",
	"2022-05-20",
	"2023-08-01",
	"2024-01-03",
	"2025-10-04",
	"2026-09-22",
	"2026-10-04",
	"2026-11-03",
];
const evidence: unknown[] = [];
class ValidationRollback extends Error {}
try {
	for (const user of ["performance-user", "performance-user-1"]) {
		try {
			await withRawTransaction(async query => {
				for (const phase of ["fixture", "adversarial", "retroactive"] as const) {
					if (phase === "adversarial")
						for (const statement of adversarial.split(";").filter(part => part.trim()))
							await query(statement, statement.includes("$1") ? [user] : []);
					if (phase === "retroactive")
						await query(
							`UPDATE "Transaction" SET "date"='2023-08-01',"amount"="amount"+1.23 WHERE "id"=(SELECT "id" FROM "Transaction" WHERE "userId"=$1 ORDER BY "id" LIMIT 1)`,
							[user],
						);
					const started = performance.now();
					const before = await query<{ date: string; accountId: string; balance: string }>(baseline, [
						user,
						dates,
					]);
					if (!before.length) throw new Error(`Missing account fixture: ${user}`);
					const beforeMs = performance.now() - started;
					const optimizedAt = performance.now();
					const after = await query<(typeof before)[number]>(monetaryBalancesSql, [user, dates]);
					const afterMs = performance.now() - optimizedAt;
					const cents = (rows: typeof before) =>
						rows.map(row => ({ ...row, balance: Math.round(Number(row.balance) * 100) }));
					if (JSON.stringify(cents(before)) !== JSON.stringify(cents(after)))
						throw new Error("Financial balance mismatch");
					if (phase === "adversarial") {
						const expected = new Map([
							["balance-test-cash", 50111],
							["balance-test-saving", 355],
							["balance-test-rewards", 12600],
						]);
						for (const [accountId, balance] of expected) {
							const row = cents(after).find(
								item => item.accountId === accountId && item.date === "2026-10-04",
							);
							if (row?.balance !== balance) throw new Error(`Independent balance mismatch: ${accountId}`);
						}
						if (after.some(row => row.accountId === "balance-test-points"))
							throw new Error("Points included in monetary balances");
					}
					evidence.push({ afterMs, beforeMs, equal: true, phase, rows: before.length, user });
				}
				throw new ValidationRollback();
			});
		} catch (error) {
			if (!(error instanceof ValidationRollback)) throw error;
		}
	}
	const plans = await queryRaw(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${monetaryBalancesSql}`, [
		"performance-user",
		dates,
	]);
	const fixtures = await queryRaw<{ userId: string; transactions: string }>(
		`SELECT "userId",count(*)::text AS transactions FROM "Transaction" WHERE "userId"=ANY($1) GROUP BY "userId" ORDER BY "userId"`,
		[["performance-user", "performance-user-1"]],
	);
	const report = {
		acceptance: "diagnostic",
		evidence,
		fixtures,
		plans,
		referenceDate: "2026-10-04",
		rolledBack: true,
	};
	await Bun.write(
		process.env.PERFORMANCE_REPORT_PATH ?? new URL("./balances-0018.json", import.meta.url),
		JSON.stringify(report, null, 2),
	);
	console.info(JSON.stringify(evidence));
} finally {
	await closeDatabase();
}
