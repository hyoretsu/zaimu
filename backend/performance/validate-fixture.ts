const url = new URL(process.env.PERFORMANCE_DATABASE_URL ?? "");
if (url.hostname !== "127.0.0.1" || url.port !== "55495" || url.pathname !== "/zaimu_performance")
	throw new Error("Dedicated local performance DB required");
process.env.DATABASE_URL = url.href;
const { queryRaw, closeDatabase } = await import("sql");
try {
	const [row] = await queryRaw<{
		mismatches: number;
		missingPlans: number;
		users: number;
		transactions: number;
	}>(`
 SELECT (SELECT count(*)::int FROM "CreditPurchaseRecord" p WHERE p."userId" LIKE 'performance-user%' AND p."totalAmount" <> (SELECT sum(i."amount") FROM "CreditInstallmentPlan" i WHERE i."purchaseId"=p."id")) AS mismatches,
 (SELECT count(*)::int FROM "CreditPurchaseRecord" p WHERE p."userId" LIKE 'performance-user%' AND NOT EXISTS(SELECT 1 FROM "CreditInstallmentPlan" i WHERE i."purchaseId"=p."id")) AS "missingPlans",
 (SELECT count(*)::int FROM "user" WHERE "id" LIKE 'performance-user%') AS users,
 (SELECT count(*)::int FROM "Transaction" WHERE "userId" LIKE 'performance-user%') AS transactions`);
	if (
		!row ||
		row.mismatches ||
		row.missingPlans ||
		row.users !== Number(process.env.PERFORMANCE_FIXTURE_USERS ?? 20) ||
		row.transactions !== row.users * Number(process.env.PERFORMANCE_FIXTURE_SIZE ?? 10000)
	)
		throw new Error("Fixture validation failed");
	console.log(JSON.stringify({ valid: true, ...row }));
} finally {
	await closeDatabase();
}

export {};
