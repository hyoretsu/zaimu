import { civilDate } from "@zaimu/finance/financial-indicators";
import { loanAccountAmounts } from "@zaimu/finance/loan";
import {
	activeLoanVersion,
	applyLoanSimulation,
	buildContractSchedule,
	outstandingLoanSchedule,
	recordLoanPayment,
	restructureLoanContract,
	reverseLoanReceipt,
	simulateLoanOperation,
} from "@zaimu/finance/loan-contract";
import { Elysia, t } from "elysia";
import { assertBalanceAccountOwnership, requireUserId } from "~/modules/auth";
import { financialAccountCurrency } from "~/modules/currencies/application/financial-money";
import { getCurrencyRate } from "~/modules/currencies/infra/currency-exchange";
import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import {
	insertLoanBook,
	loadLoanBook,
	loanReferenceContext,
	saveLoanBook,
} from "../../application/loan-contracts";
import { loanPlannerContext } from "../../application/loan-planner-context";
import {
	LoanBookingDTO,
	LoanContractBookDTO,
	LoanContractTermsDTO,
	LoanSimulationInputDTO,
	LoanSimulationReturn,
} from "./LoanContractDTO";

const Params = t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) });
const booking = async (
	userId: string,
	loanCurrency: string,
	amount: number,
	date: string,
	body: typeof LoanBookingDTO.static,
) => {
	if (body.accountId) await assertBalanceAccountOwnership(body.accountId, userId);
	const accountCurrency = body.accountId ? await financialAccountCurrency(body.accountId, userId) : null;
	const [accountAmount] = await loanAccountAmounts(
		[amount],
		loanCurrency,
		accountCurrency,
		body.accountAmount ?? undefined,
		(from, to) => getCurrencyRate(new Date(date), from, to),
	);
	return { accountAmount: accountAmount ?? null, accountCurrency, accountId: body.accountId, id: body.id };
};
export const LoanContractsController = new Elysia({ prefix: "/loans" })
	.get(
		"/planner/context",
		async ({ request, query }) => loanPlannerContext(await requireUserId(request), query.currency),
		{
			query: t.Object({ currency: t.String({ maxLength: 3, minLength: 3 }) }),
			response: t.Object({
				capturedAt: t.String(),
				conversionRates: t.Unknown(),
				holidays: t.Unknown(),
				input: t.Unknown(),
				observations: t.Optional(t.Unknown()),
				projections: t.Unknown(),
				taxDefinitions: t.Unknown(),
				yieldAccounts: t.Unknown(),
			}),
		},
	)
	.get(
		"/scenarios",
		async ({ request }) =>
			queryRaw('SELECT * FROM "LoanScenario" WHERE "userId"=$1 ORDER BY "updatedAt" DESC', [
				await requireUserId(request),
			]),
		{
			response: t.Array(
				t.Object({
					createdAt: t.Date(),
					id: t.String(),
					name: t.String(),
					parameters: t.Unknown(),
					summary: t.Unknown(),
					updatedAt: t.Date(),
					userId: t.String(),
				}),
			),
		},
	)
	.post(
		"/scenarios",
		async ({ request, body }) => {
			const userId = await requireUserId(request);
			if (!body.name.trim()) throw new HttpException("Informe nome do cenário", 400);
			const [saved] = await queryRaw(
				'INSERT INTO "LoanScenario" ("id","userId","name","parameters","summary","updatedAt") VALUES ($1,$2,$3,$4::json,$5::json,NOW()) ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name","parameters"=EXCLUDED."parameters","summary"=EXCLUDED."summary","updatedAt"=NOW() WHERE "LoanScenario"."userId"=$2 RETURNING "id"',
				[
					body.id,
					userId,
					body.name.trim(),
					JSON.stringify(body.parameters),
					JSON.stringify(body.summary),
				],
			);
			if (!saved) throw new HttpException("Cenário indisponível", 404);
			return { id: body.id };
		},
		{
			body: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
				name: t.String({ maxLength: 150, minLength: 1 }),
				parameters: t.Unknown(),
				summary: t.Unknown(),
			}),
			response: t.Object({ id: t.String() }),
		},
	)
	.delete(
		"/scenarios/:id",
		async ({ request, params }) => {
			await queryRaw('DELETE FROM "LoanScenario" WHERE "id"=$1 AND "userId"=$2', [
				params.id,
				await requireUserId(request),
			]);
			return { success: true };
		},
		{ params: Params, response: t.Object({ success: t.Boolean() }) },
	)
	.get(
		"/:id/contract",
		async ({ params, request }) => loadLoanBook(await requireUserId(request), params.id),
		{ params: Params, response: LoanContractBookDTO },
	)
	.post(
		"/contracts",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			const context = await loanReferenceContext(new Date().toISOString().slice(0, 10));
			return withRawTransaction(async () => {
				const book = await insertLoanBook(
					userId,
					body.institutionId,
					body.terms,
					body.description,
					context.reference,
				);
				if (body.disbursementAccountId && body.disbursementTransactionId)
					throw new HttpException("Selecione apenas criar ou vincular crédito", 400);
				if (body.disbursementAccountId) {
					await assertBalanceAccountOwnership(body.disbursementAccountId, userId);
					const currency = await financialAccountCurrency(body.disbursementAccountId, userId);
					if (currency !== body.terms.currency)
						throw new HttpException("Crédito recebido exige conta na moeda do contrato", 400);
					const id = crypto.randomUUID();
					await queryRaw(
						`INSERT INTO "Transaction" ("id","userId","type","amount","date","destinationFinancialAccountId","bookingCurrency","description","updatedAt") VALUES ($1,$2,'INCOME',$3,$4::date,$5,$6,$7,NOW())`,
						[
							id,
							userId,
							body.terms.principalAmount,
							body.terms.startDate,
							body.disbursementAccountId,
							currency,
							"Crédito de empréstimo",
						],
					);
					book.disbursementTransactionId = id;
					await saveLoanBook(userId, book);
				}
				if (body.disbursementTransactionId) {
					const [transaction] = await queryRaw<{ id: string }>(
						`SELECT "id" FROM "Transaction" WHERE "id"=$1 AND "userId"=$2 AND "type"='INCOME' AND "bookingCurrency"=$3 AND "amount"=$4 FOR UPDATE`,
						[
							body.disbursementTransactionId,
							userId,
							body.terms.currency,
							body.terms.principalAmount,
						],
					);
					if (!transaction) throw new HttpException("Crédito recebido incompatível", 400);
					const [linked] = await queryRaw(
						`SELECT "id" FROM "Loan" WHERE "contractBook"->>'disbursementTransactionId'=$1`,
						[transaction.id],
					);
					if (linked) throw new HttpException("Crédito já associado", 409);
					book.disbursementTransactionId = transaction.id;
					await saveLoanBook(userId, book);
				}
				return book;
			});
		},
		{
			body: t.Object({
				description: t.Optional(t.String({ maxLength: 500 })),
				disbursementAccountId: t.Optional(t.String({ maxLength: 36 })),
				disbursementTransactionId: t.Optional(t.String({ maxLength: 36 })),
				institutionId: t.String({ maxLength: 36, minLength: 1 }),
				terms: LoanContractTermsDTO,
			}),
			response: LoanContractBookDTO,
		},
	)
	.patch(
		"/:id/contract",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			const context = await loanReferenceContext(body.effectiveDate);
			return withRawTransaction(async () => {
				const book = await loadLoanBook(userId, params.id, true);
				if (book.revision !== body.expectedRevision)
					throw new HttpException("Contrato mudou; revise alterações", 409);
				if (book.receipts.length && body.terms.currency !== activeLoanVersion(book).terms.currency)
					throw new HttpException("Moeda do histórico não pode mudar", 400);
				const remaining = outstandingLoanSchedule(book).reduce((sum, row) => sum + row.principal, 0);
				if (book.receipts.length && Math.abs(body.terms.principalAmount - remaining) > 0.005)
					throw new HttpException(
						"Edição deve preservar principal restante; use renegociação",
						400,
					);
				civilDate(body.effectiveDate);
				if (body.effectiveDate < activeLoanVersion(book).effectiveDate)
					throw new HttpException("Vigência anterior ao histórico", 400);
				book.institutionId = body.institutionId;
				book.revision++;
				book.versions.push({
					effectiveDate: body.effectiveDate,
					reason: "EDIT",
					revision: book.revision,
					schedule: buildContractSchedule(body.terms, book.revision, context.reference),
					terms: body.terms,
				});
				await saveLoanBook(userId, book);
				return book;
			});
		},
		{
			body: t.Object({
				effectiveDate: t.String(),
				expectedRevision: t.Integer(),
				institutionId: t.String({ maxLength: 36, minLength: 1 }),
				terms: LoanContractTermsDTO,
			}),
			params: Params,
			response: LoanContractBookDTO,
		},
	)
	.post(
		"/:id/restructure",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			const context = await loanReferenceContext(body.terms.startDate);
			return withRawTransaction(async () => {
				const book = await loadLoanBook(userId, params.id, true);
				const created = await insertLoanBook(
					userId,
					body.institutionId,
					body.terms,
					undefined,
					context.reference,
				);
				const pair = restructureLoanContract(
					book,
					{ ...body, receiptId: crypto.randomUUID(), successorId: created.loanId },
					context.reference,
				);
				await saveLoanBook(userId, pair.source);
				await saveLoanBook(userId, pair.successor);
				return pair;
			});
		},
		{
			body: t.Object({
				expectedRevision: t.Integer(),
				institutionId: t.String({ maxLength: 36, minLength: 1 }),
				kind: t.Union([t.Literal("RENEGOTIATE"), t.Literal("PORTABILITY")]),
				settlementAmount: t.Number({ exclusiveMinimum: 0 }),
				terms: LoanContractTermsDTO,
			}),
			params: Params,
			response: t.Object({ source: LoanContractBookDTO, successor: LoanContractBookDTO }),
		},
	)

	.post(
		"/:id/simulate",
		async ({ params, body, request }) => {
			const book = await loadLoanBook(await requireUserId(request), params.id);
			const context = await loanReferenceContext(new Date().toISOString().slice(0, 10));
			return simulateLoanOperation(book, body, context.reference);
		},
		{ body: LoanSimulationInputDTO, params: Params, response: LoanSimulationReturn },
	)
	.post(
		"/:id/execute",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			const context = await loanReferenceContext(new Date().toISOString().slice(0, 10));
			return withRawTransaction(async () => {
				const book = await loadLoanBook(userId, params.id, true);
				const payment = await booking(
					userId,
					activeLoanVersion(book).terms.currency,
					body.simulation.amount,
					body.simulation.input.date,
					body.booking,
				);
				if (body.simulation.input.quotedAmount === undefined)
					throw new HttpException("Informe valor confirmado pelo credor", 400);
				const next = applyLoanSimulation(book, body.simulation, payment, context.reference);
				await saveLoanBook(userId, next);
				return next;
			});
		},
		{
			body: t.Object({ booking: LoanBookingDTO, simulation: LoanSimulationReturn }),
			params: Params,
			response: LoanContractBookDTO,
		},
	)
	.post(
		"/:id/receipts",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			return withRawTransaction(async () => {
				const book = await loadLoanBook(userId, params.id, true);
				const payment = await booking(
					userId,
					activeLoanVersion(book).terms.currency,
					body.amount,
					body.date,
					body.booking,
				);
				const next = recordLoanPayment(book, {
					...payment,
					amount: body.amount,
					date: body.date,
					expectedRevision: body.expectedRevision,
					installmentIds: body.installmentIds,
				});
				await saveLoanBook(userId, next);
				return next;
			});
		},
		{
			body: t.Object({
				amount: t.Number({ exclusiveMinimum: 0 }),
				booking: LoanBookingDTO,
				date: t.String(),
				expectedRevision: t.Integer(),
				installmentIds: t.Optional(t.Array(t.String())),
			}),
			params: Params,
			response: LoanContractBookDTO,
		},
	)
	.post(
		"/:id/reverse",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			return withRawTransaction(async () => {
				const book = await loadLoanBook(userId, params.id, true);
				const next = reverseLoanReceipt(
					book,
					body.receiptId,
					body.id,
					body.date,
					body.expectedRevision,
				);
				await saveLoanBook(userId, next);
				return next;
			});
		},
		{
			body: t.Object({
				date: t.String(),
				expectedRevision: t.Integer(),
				id: t.String({ maxLength: 36 }),
				receiptId: t.String(),
			}),
			params: Params,
			response: LoanContractBookDTO,
		},
	);
