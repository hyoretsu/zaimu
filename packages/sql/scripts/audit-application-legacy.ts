import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "pg";

/** Read-only local evidence. Never falls back to DATABASE_URL. */
const url = process.env.DATABASE_AUDIT_URL;
if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
	throw new Error("DATABASE_AUDIT_URL must target PostgreSQL on this computer.");
const output = process.argv[2];
if (!output) throw new Error("Provide a local output filename for the audit.");
const tables = [
	"Salary",
	"SalaryHistory",
	"Subscription",
	"SubscriptionHistory",
	"RecurringPayment",
	"RecurringPaymentHistory",
	"Recurrence",
	"RecurrenceHistory",
	"RecurrenceOccurrence",
	"ApplicationUpgradeRecurrence",
	"ApplicationUpgradeArchive",
	"Debt",
	"DebtHistory",
	"DebtPerson",
	"DebtEvent",
	"DebtTransactionLink",
	"DebtPurchaseLink",
	"DebtSplit",
	"DebtSplitParticipant",
	"Transaction",
	"CreditPurchaseRecord",
	"CreditInstallmentPlan",
	"CreditInstallmentRecord",
	"CreditRefundRecord",
	"CreditPurchaseLegacyEntry",
	"CreditEntryReference",
	"CreditBookTombstone",
	"CreditCardStatement",
	"CreditStatementCharge",
	"TagAssignment",
	"Loan",
	"LoanPayment",
] as const;
const client = new Client({ connectionString: url });
await client.connect();
try {
	await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
	const audit: Record<string, unknown> = {};
	for (const table of tables) {
		const exists = (
			await client.query("SELECT to_regclass($1) IS NOT NULL AS exists", [`public."${table}"`])
		).rows[0].exists;
		if (!exists) {
			audit[table] = { exists: false };
			continue;
		}
		const rows = (
			await client.query(`SELECT to_jsonb(t) AS record FROM "${table}" t ORDER BY to_jsonb(t)::text`)
		).rows.map(row => row.record);
		const totals: Record<string, string> = {};
		for (const field of [
			"amount",
			"effect",
			"totalAmount",
			"installmentAmount",
			"cashbackAmount",
			"principalPaid",
			"totalPaid",
		])
			if (rows.some(row => field in row))
				// PostgreSQL numeric keeps exact decimal sums, including negative compensation events.
				totals[field] = (
					await client.query(`SELECT COALESCE(sum("${field}"),0)::text AS total FROM "${table}"`)
				).rows[0].total;
		audit[table] = {
			count: rows.length,
			digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
			rows,
			totals,
		};
	}
	await client.query("COMMIT");
	await Bun.write(
		resolve(output),
		JSON.stringify({ capturedAt: new Date().toISOString(), tables: audit }, null, 2),
	);
} finally {
	await client.end();
}
