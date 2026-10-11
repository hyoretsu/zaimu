import {
	bookPurchase,
	type CreditBook,
	creditBookPlan,
	updateBookPurchaseDate,
} from "@zaimu/finance/credit-book";
import { mutateCreditBook, readCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { closeDatabase, queryRaw } from "~/shared/infra/sql";

const args = process.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];
const email = option("--email");
const description = option("--description");
const date = option("--date");
const calendar = (book: CreditBook, purchaseId: string) => {
	const plan = creditBookPlan(book);
	return plan.installments
		.filter(item => item.purchaseId === purchaseId)
		.map(item => {
			const statement = plan.statements.find(statement => statement.id === item.statementId)!;
			return {
				amountCents: item.amountCents,
				dueDate: statement.dueDate,
				number: item.number,
				statementDate: statement.statementDate,
			};
		});
};
try {
	if (
		!args.includes("--email") ||
		!args.includes("--description") ||
		!args.includes("--date") ||
		!email ||
		!description ||
		!date
	)
		throw new Error(
			"Use --email EMAIL --description DESCRIPTION --date YYYY-MM-DD [--apply]. Sem --apply, somente mostra o reparo.",
		);
	const rows = await queryRaw<{ id: string; userId: string; creditCardId: string; cardName: string }>(
		`SELECT p."id", p."userId", p."creditCardId", a."name" AS "cardName" FROM "CreditPurchaseRecord" p JOIN "user" u ON u."id"=p."userId" JOIN "CreditCard" c ON c."id"=p."creditCardId" JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE u."email"=$1 AND p."description"=$2 AND p."purchaseDate"::date=$3::date`,
		[email, description, date],
	);
	if (rows.length !== 1)
		throw new Error(`Esperada uma compra exata; encontradas ${rows.length}. Nenhuma alteração aplicada.`);
	const row = rows[0]!;
	const original = await readCreditBook(row.userId, row.creditCardId);
	const preview = structuredClone(original);
	const purchase = bookPurchase(preview, row.id);
	if (purchase.installmentImportedNumbers?.length)
		throw new Error("Compra possui parcelas importadas; calendário exige revisão explícita antes do reparo.");
	updateBookPurchaseDate(preview, purchase.id, purchase.purchaseDate);
	const after = calendar(preview, purchase.id);
	if (new Set(after.map(item => item.dueDate.slice(0, 7))).size !== after.length)
		throw new Error("Calendário reparado ainda possui parcelas no mesmo mês. Nenhuma alteração aplicada.");
	console.log(
		JSON.stringify(
			{ after, before: calendar(original, row.id), card: row.cardName, purchaseId: row.id },
			null,
			2,
		),
	);
	if (args.includes("--apply")) {
		const { distributedCache } = await import("~/shared/infra/cache/runtime");
		const namespaces = [
			"accounts:detail",
			"accounts:list",
			"credit-cards:overview",
			`credit-cards:${row.creditCardId}:statements`,
			"debts:events",
			"debts:overview",
			"dashboard",
			"transactions:list",
		] as const;
		const token = await distributedCache.beginWrite(row.userId, namespaces);
		try {
			await mutateCreditBook(row.userId, row.creditCardId, book => {
				const current = bookPurchase(book, row.id);
				if (
					current.purchaseDate !== purchase.purchaseDate ||
					JSON.stringify(calendar(book, row.id)) !== JSON.stringify(calendar(original, row.id))
				)
					throw new Error("Compra mudou após a leitura. Repita a conferência.");
				updateBookPurchaseDate(book, current.id, current.purchaseDate);
			});
		} finally {
			await distributedCache.finishWrite(row.userId, namespaces, token);
		}
		const saved = await readCreditBook(row.userId, row.creditCardId);
		if (JSON.stringify(calendar(saved, row.id)) !== JSON.stringify(after))
			throw new Error("Calendário gravado difere da prévia. Verifique dados antes de repetir.");
		console.log("Calendário da compra reparado e conferido.");
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	await closeDatabase();
}
