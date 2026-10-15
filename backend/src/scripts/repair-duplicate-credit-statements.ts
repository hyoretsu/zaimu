import { writeFile } from "node:fs/promises";
import { type CreditBook, materializeBookInstallments, replayCreditBook } from "@zaimu/finance/credit-book";
import {
	loadCreditBook,
	readCreditBook,
	saveCreditBook,
} from "~/modules/creditCards/application/normalized-credit-book";
import { closeDatabase, withRawTransaction } from "~/shared/infra/sql";

const args = process.argv.slice(2);
const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const cardId = option("--card-id");
const userId = option("--user-id");

function consolidate(book: CreditBook) {
	const removed: string[] = [];
	for (const group of Object.values(Object.groupBy(book.statements, statement => statement.dueDate))) {
		if (!group || group.length < 2) continue;
		const [target, ...duplicates] = group.toSorted((a, b) => a.statementDate.localeCompare(b.statementDate));
		if (!target) continue;
		for (const source of duplicates) {
			target.isFullySynced ||= source.isFullySynced;
			for (const installment of book.installments)
				if (installment.statementId === source.id) installment.statementId = target.id;
			for (const refund of book.refunds)
				if (refund.creditStatementId === source.id) refund.creditStatementId = target.id;
			for (const charge of book.charges) if (charge.statementId === source.id) charge.statementId = target.id;
			for (const purchase of book.purchases) {
				for (const dates of purchase.installmentStatementDates ?? []) {
					if (dates?.statementDate === source.statementDate && dates.dueDate === source.dueDate)
						dates.statementDate = target.statementDate;
				}
			}
			removed.push(source.id);
		}
	}
	book.statements = book.statements.filter(statement => !removed.includes(statement.id));
	return removed;
}

try {
	if (!cardId || !userId) throw new Error("Use --card-id ID --user-id ID [--apply]. Preview is read-only.");
	const before = await readCreditBook(userId, cardId);
	const preview = structuredClone(before);
	const removed = consolidate(preview);
	materializeBookInstallments(preview);
	console.log(
		JSON.stringify(
			{
				removed,
				statements: replayCreditBook(preview).statements.map(s => ({
					dueDate: s.dueDate,
					id: s.id,
					paidAmount: s.paidAmount,
					statementDate: s.statementDate,
					totalAmount: s.totalAmount,
				})),
			},
			null,
			2,
		),
	);
	if (args.includes("--apply") && removed.length) {
		const backup = `/tmp/credit-statements-${cardId}-${Date.now()}.json`;
		await writeFile(backup, JSON.stringify(before), { mode: 0o600 });
		console.log(`Backup: ${backup}`);
		const { distributedCache } = await import("~/shared/infra/cache/runtime");
		const namespaces = [
			"accounts:detail",
			"accounts:list",
			"credit-cards:overview",
			`credit-cards:${cardId}:statements`,
			"debts:events",
			"debts:overview",
			"dashboard",
			"transactions:list",
		] as const;
		const token = await distributedCache.beginWrite(userId, namespaces);
		try {
			await withRawTransaction(async query => {
				const book = await loadCreditBook(query, userId, cardId, true);
				if (JSON.stringify(book) !== JSON.stringify(before))
					throw new Error("Book changed since preview; retry.");
				const original = structuredClone(book);
				const deleted = consolidate(book);
				materializeBookInstallments(book);
				await saveCreditBook(query, book, original);
				await query(`DELETE FROM "CreditCardStatement" WHERE "creditCardId"=$1 AND "id"=ANY($2)`, [
					cardId,
					deleted,
				]);
			});
		} finally {
			await distributedCache.finishWrite(userId, namespaces, token);
		}
		const saved = await readCreditBook(userId, cardId);
		if (consolidate(structuredClone(saved)).length) throw new Error("Duplicate cycles remain after repair.");
		if (
			saved.installments.length !== before.installments.length ||
			saved.purchases.length !== before.purchases.length ||
			saved.refunds.length !== before.refunds.length ||
			saved.charges.length !== before.charges.length
		)
			throw new Error("Record counts changed; inspect backup.");
		console.log("Repair saved; duplicate cycles removed and record counts verified.");
	}
} finally {
	await closeDatabase();
}
