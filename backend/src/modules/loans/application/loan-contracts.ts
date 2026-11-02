import {
	activeLoanVersion,
	createLoanContract,
	type LoanContractBook,
	type LoanContractTerms,
	type LoanReference,
} from "@zaimu/finance/loan-contract";
import { legacyLoanBook, loanBookPaymentRows } from "@zaimu/finance/loan-legacy";
import { visibleInstitution } from "~/modules/accounts/application/universal-institutions";
import { assertSupportedCurrency } from "~/modules/currencies/application/currency-defaults";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, nullableNumeric, queryFirst, queryRaw, queryRows } from "~/shared/infra/sql";

export { financialIndicatorContext as loanReferenceContext } from "~/modules/reference-rates/application/financial-indicators";
export async function loadLoanBook(userId: string, id: string, lock = false): Promise<LoanContractBook> {
	if (lock)
		await queryRows(
			db.sql.public.Loan.select("id")
				.where((fields, ops) => ops.and(ops.eq(fields.id, id), ops.eq(fields.userId, userId)))
				.forUpdate()
				.build(),
		);
	const row = await queryFirst(
		db.sql.public.Loan.select(
			"id",
			"userId",
			"institutionId",
			"lender",
			"principalAmount",
			"interestRate",
			"totalInstallments",
			"installmentAmount",
			"dueDay",
			"startDate",
			"firstDueDate",
			"description",
			"amortization",
			"currency",
			"contractBook",
			"createdAt",
			"updatedAt",
		)
			.where((fields, ops) => ops.and(ops.eq(fields.id, id), ops.eq(fields.userId, userId)))
			.build(),
	);
	if (!row) throw new HttpException("Empréstimo não encontrado", 404);
	if (row.contractBook) return JSON.parse(JSON.stringify(row.contractBook));
	const amortization = row.amortization;
	if (amortization !== "PRICE" && amortization !== "SAC")
		throw new HttpException("Sistema de amortização inválido", 500);
	const payments = await queryRows(
		db.sql.public.LoanPayment.select(
			"id",
			"loanId",
			"installmentNumber",
			"dueDate",
			"principalPaid",
			"interestPaid",
			"totalPaid",
			"paidDate",
			"financialAccountId",
			"accountAmount",
			"accountCurrency",
			"isAdvanced",
			"advanceType",
			"currency",
			"createdAt",
			"updatedAt",
		)
			.where((fields, ops) => ops.eq(fields.loanId, id))
			.orderBy("installmentNumber", { direction: "asc" })
			.build(),
	);
	const date = (value: unknown) =>
		value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
	return legacyLoanBook(
		{
			...row,
			amortization,
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
	await executeStatement(
		db.sql.public.Loan.update({
			contractBook: JSON.parse(JSON.stringify(book)),
			institutionId: book.institutionId,
			...(institution ? { lender: institution.name } : {}),
			currency: terms.currency,
			updatedAt: new Date(),
		})
			.where((fields, ops) => ops.and(ops.eq(fields.id, book.loanId), ops.eq(fields.userId, userId)))
			.build(),
	);
	await executeStatement(
		db.sql.public.LoanPayment.delete()
			.where((fields, ops) => ops.eq(fields.loanId, book.loanId))
			.build(),
	);
	const rows = loanBookPaymentRows(book);
	if (rows.length)
		await executeStatement(
			db.sql.public.LoanPayment.insert(
				rows.map(row => ({
					accountAmount: nullableNumeric(row.accountAmount ?? null),
					accountCurrency: row.accountCurrency,
					currency: terms.currency,
					dueDate: row.dueDate,
					financialAccountId: row.financialAccountId,
					id: row.id,
					installmentNumber: row.installmentNumber,
					interestPaid: String(row.interestPaid),
					isAdvanced: row.isAdvanced,
					loanId: book.loanId,
					paidDate: row.paidDate ?? null,
					principalPaid: String(row.principalPaid),
					totalPaid: String(row.totalPaid),
					updatedAt: new Date(),
				})),
			).build(),
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
	await executeStatement(
		db.sql.public.Loan.insert([
			{
				amortization: terms.amortization === "MANUAL" ? "PRICE" : terms.amortization,
				currency: terms.currency,
				description: description ?? null,
				dueDay: Number(terms.firstDueDate.slice(8)),
				firstDueDate: terms.firstDueDate,
				id,
				installmentAmount: String(initial.principal + initial.interest + initial.charges),
				institutionId,
				interestRate: String((terms.rate.fixedRate ?? 0) / 100),
				lender: institution.name,
				principalAmount: String(terms.principalAmount),
				startDate: terms.startDate,
				totalInstallments: terms.totalInstallments,
				updatedAt: new Date(),
				userId,
			},
		]).build(),
	);
	await saveLoanBook(userId, book);
	return book;
}

export async function loanPaymentTotals(loanId: string) {
	const [totals] = await queryRaw<{ count: string; principal: string; interest: string }>(
		`SELECT COUNT(*) FILTER (WHERE "paidDate" IS NOT NULL) AS "count",
 COALESCE(SUM("principalPaid") FILTER (WHERE "paidDate" IS NULL), 0) AS "principal",
 COALESCE(SUM("interestPaid") FILTER (WHERE "paidDate" IS NULL), 0) AS "interest"
 FROM "public"."LoanPayment" WHERE "loanId" = $1`,
		[loanId],
	);
	return totals;
}
