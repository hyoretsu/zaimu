import { Client } from "pg";
import { PERFORMANCE_REFERENCE_DATE } from "./clock";

export function performanceClockEvidence(databaseDate: string, diagnostic = false) {
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(databaseDate) ||
		!Number.isFinite(Date.parse(`${databaseDate}T00:00:00Z`)) ||
		new Date(`${databaseDate}T00:00:00Z`).toISOString().slice(0, 10) !== databaseDate
	)
		throw new Error("Invalid PostgreSQL business date");
	const consistent = databaseDate === PERFORMANCE_REFERENCE_DATE;
	if (!consistent && !diagnostic)
		throw new Error(
			`PostgreSQL business date ${databaseDate} differs from application reference ${PERFORMANCE_REFERENCE_DATE}; fixed-clock acceptance unavailable`,
		);
	return { applicationDate: PERFORMANCE_REFERENCE_DATE, consistent, databaseDate };
}

/** Never inherit DATABASE_URL; this connection is always the dedicated loopback fixture. */
export async function preflight(users: number, { diagnostic = false } = {}) {
	const client = new Client({
		connectionString: "postgresql://performance:performance-local@127.0.0.1:55495/zaimu_performance",
		connectionTimeoutMillis: 5000,
	});
	try {
		await client.connect();
		const dateResult = await client.query<{ businessDate: string }>(
			`SELECT CURRENT_DATE::text AS "businessDate"`,
		);
		const clock = performanceClockEvidence(dateResult.rows[0]?.businessDate ?? "", diagnostic);
		const accounts = await client.query<{ email: string }>(
			'SELECT "email" FROM "user" WHERE "email" LIKE $1',
			["performance%@zaimu.local"],
		);
		for (let index = 0; index < users; index++)
			if (!accounts.rows.some(row => row.email === `performance${index}@zaimu.local`))
				throw new Error(`Missing isolated fixture user ${index}`);
		const result = await client.query(
			`SELECT count(*) AS invalid FROM "CreditPurchaseRecord" p LEFT JOIN (SELECT "purchaseId",sum("amount") AS total FROM "CreditInstallmentPlan" GROUP BY "purchaseId") plan ON plan."purchaseId"=p."id" WHERE p."userId" LIKE 'performance-user%' AND (plan.total IS NULL OR plan.total<>p."totalAmount")`,
		);
		if (Number(result.rows[0].invalid))
			throw new Error("Fixture purchase principal does not equal installment sum");
		const size = await client.query('SELECT count(*) AS size FROM "Transaction" WHERE "userId"=$1', [
			"performance-user",
		]);
		return {
			clock,
			database: "zaimu_performance",
			namespace: "zaimu_performance",
			referenceDate: PERFORMANCE_REFERENCE_DATE,
			transactions: Number(size.rows[0].size),
			users,
		};
	} finally {
		await client.end();
	}
}

export async function cleanupPerformanceLoan(id: string, user: number) {
	const client = new Client({
		connectionString: "postgresql://performance:performance-local@127.0.0.1:55495/zaimu_performance",
		connectionTimeoutMillis: 5000,
	});
	try {
		await client.connect();
		const result = await client.query(
			'DELETE FROM "Loan" WHERE "id"=$1 AND "userId"=$2 AND "lender" LIKE $3 RETURNING "id"',
			[id, user === 0 ? "performance-user" : `performance-user-${user}`, "Performance loan%"],
		);
		if (result.rowCount !== 1)
			throw new Error("Loan cleanup did not remove its isolated scenario record");
	} finally {
		await client.end();
	}
}
