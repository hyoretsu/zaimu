import {
	activeLoanVersion,
	createLoanContract,
	type LoanContractBook,
	type LoanContractTerms,
	type LoanReference,
} from "@zaimu/finance/loan-contract";
import {
	legacyLoanBook,
	type LegacyLoanPaymentRow,
	type LegacyLoanRow,
	loanBookPaymentRows,
} from "@zaimu/finance/loan-legacy";
import { visibleInstitution } from "~/modules/accounts/application/universal-institutions";
import { assertSupportedCurrency } from "~/modules/currencies/application/currency-defaults";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";

export { financialIndicatorContext as loanReferenceContext } from "~/modules/reference-rates/application/financial-indicators";
export async function loadLoanBook(userId: string, id: string, lock = false): Promise<LoanContractBook> {
	const [row] = await queryRaw<
		LegacyLoanRow & Record<string, unknown> & { contractBook: LoanContractBook | null }
	>(`SELECT * FROM "Loan" WHERE "id"=$1 AND "userId"=$2${lock ? " FOR UPDATE" : ""}`, [id, userId]);
	if (!row) throw new HttpException("Empréstimo não encontrado", 404);
	if (row.contractBook) return row.contractBook;
	const payments = await queryRaw<LegacyLoanPaymentRow & Record<string, unknown>>(
		`SELECT * FROM "LoanPayment" WHERE "loanId"=$1 ORDER BY "installmentNumber"`,
		[id],
	);
	const date = (value: unknown) =>
		value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
	return legacyLoanBook(
		{
			...row,
			firstDueDate: date(row.firstDueDate),
			interestRate: Number(row.interestRate),
			principalAmount: Number(row.principalAmount),
			startDate: date(row.startDate),
		},
		payments.map(payment => ({
			...payment,
			accountAmount: payment.accountAmount == null ? null : Number(payment.accountAmount),
			dueDate: date(payment.dueDate),
			interestPaid: Number(payment.interestPaid),
			paidDate: payment.paidDate ? date(payment.paidDate) : null,
			principalPaid: Number(payment.principalPaid),
			totalPaid: Number(payment.totalPaid),
		})),
	);
}
export async function saveLoanBook(userId: string, book: LoanContractBook): Promise<void> {
	const institution = book.institutionId ? await visibleInstitution(userId, book.institutionId) : null;
	const { terms } = activeLoanVersion(book);
	await assertSupportedCurrency(terms.currency);
	await queryRaw(
		`UPDATE "Loan" SET "contractBook"=$3::json,"institutionId"=$4,"lender"=COALESCE($5,"lender"),"currency"=$6,"updatedAt"=NOW() WHERE "id"=$1 AND "userId"=$2`,
		[
			book.loanId,
			userId,
			JSON.stringify(book),
			book.institutionId,
			institution?.name ?? null,
			terms.currency,
		],
	);
	await queryRaw(`DELETE FROM "LoanPayment" WHERE "loanId"=$1`, [book.loanId]);
	for (const row of loanBookPaymentRows(book))
		await queryRaw(
			`INSERT INTO "LoanPayment" ("id","loanId","currency","installmentNumber","dueDate","principalPaid","interestPaid","totalPaid","paidDate","financialAccountId","accountAmount","accountCurrency","isAdvanced","updatedAt") VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9::date,$10,$11,$12,$13,NOW())`,
			[
				row.id,
				book.loanId,
				terms.currency,
				row.installmentNumber,
				row.dueDate,
				row.principalPaid,
				row.interestPaid,
				row.totalPaid,
				row.paidDate,
				row.financialAccountId,
				row.accountAmount,
				row.accountCurrency,
				row.isAdvanced,
			],
		);
	for (const id of new Set(book.receipts.map(row => row.accountId).filter((id): id is string => !!id)))
		await enqueueAccountYieldRecalculation(
			id,
			new Date(`${terms.startDate}T12:00:00Z`),
			`loan:${book.loanId}:${book.revision}`,
		);
}
export async function insertLoanBook(
	userId: string,
	institutionId: string,
	terms: LoanContractTerms,
	description?: string,
	reference?: LoanReference,
): Promise<LoanContractBook> {
	const institution = await visibleInstitution(userId, institutionId);
	await assertSupportedCurrency(terms.currency);
	const id = crypto.randomUUID();
	const book = createLoanContract(id, institutionId, terms, reference);
	const initial = activeLoanVersion(book).schedule[0]!;
	await queryRaw(
		`INSERT INTO "Loan" ("id","userId","institutionId","lender","principalAmount","interestRate","totalInstallments","installmentAmount","dueDay","startDate","firstDueDate","description","amortization","currency","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,$13::"AmortizationType",$14,NOW())`,
		[
			id,
			userId,
			institutionId,
			institution.name,
			terms.principalAmount,
			(terms.rate.fixedRate ?? 0) / 100,
			terms.totalInstallments,
			initial.principal + initial.interest + initial.charges,
			Number(terms.firstDueDate.slice(8)),
			terms.startDate,
			terms.firstDueDate,
			description ?? null,
			terms.amortization === "MANUAL" ? "PRICE" : terms.amortization,
			terms.currency,
		],
	);
	await saveLoanBook(userId, book);
	return book;
}
