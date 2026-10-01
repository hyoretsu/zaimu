import { loanInstallments } from "@zaimu/finance/loan";
import { differenceInMonths } from "date-fns";
import Elysia, { t } from "elysia";
import { assertBalanceAccountOwnership, assertDirectOwnership, requireUserId } from "~/modules/auth";
import {
	decodePaginationCursor,
	encodePaginationCursor,
	paginationFilterHash,
} from "~/shared/application/pagination-cursor";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import {
	db,
	executeStatement,
	queryFirst,
	queryRaw,
	queryRows,
	withRawTransaction,
} from "~/shared/infra/sql";

import { LoanPaymentPageReturn } from "./LoansDTO";
import { decodePaymentCursor, paymentFilterHash, paymentPage } from "./loan-payment-pagination";

const loanColumns = [
	"id",
	"userId",
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
	"createdAt",
	"updatedAt",
] as const;
const loanPaymentColumns = [
	"id",
	"loanId",
	"financialAccountId",
	"installmentNumber",
	"principalPaid",
	"interestPaid",
	"totalPaid",
	"dueDate",
	"paidDate",
	"isAdvanced",
	"advanceType",
	"createdAt",
	"updatedAt",
] as const;

const AmortizationType = t.Union([t.Literal("PRICE"), t.Literal("SAC")]);
const AdvanceType = t.Union([t.Literal("FRONT"), t.Literal("BACK")]);
interface LoanHistoryCursor {
	changedAt: string;
	id: string;
}

interface LoanListRow extends Record<string, unknown> {
	amortization: "PRICE" | "SAC";
	description: null | string;
	dueDay: number;
	firstDueDate: Date;
	id: string;
	installmentAmount: string;
	interestRate: string;
	lender: string;
	paidInstallments: string;
	principalAmount: string;
	remainingInstallments: string;
	remainingPrincipal: string;
	startDate: Date;
	totalInstallments: number;
	totalPaid: string;
	userId: string;
}

const isLoanHistoryCursor = (value: unknown): value is LoanHistoryCursor => {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.changedAt === "string" && typeof candidate.id === "string";
};

/**
 * Calculate loan amortization schedule
 */
function calculateLoanSchedule(
	principal: number,
	monthlyRate: number,
	totalInstallments: number,
	amortization: "PRICE" | "SAC",
	startDate: Date,
	firstDueDate: Date,
) {
	let remainingBalance = principal;
	return loanInstallments({
		amortization,
		firstDueDate: firstDueDate.toISOString().slice(0, 10),
		interestRate: monthlyRate,
		principalAmount: principal,
		totalInstallments,
	}).map(row => {
		remainingBalance = Math.max(0, remainingBalance - row.principalPaid);
		return {
			dueDate: new Date(`${row.dueDate}T12:00:00`),
			installmentNumber: row.installmentNumber,
			interest: row.interestPaid,
			principal: row.principalPaid,
			remainingBalance,
			total: row.totalPaid,
		};
	});
}

/**
 * Calculate early payoff amount at a given date
 * Considers front advance (pay from start) or back advance (pay from end)
 */
function calculateEarlyPayoff(
	loan: {
		principalAmount: number;
		interestRate: number;
		totalInstallments: number;
		amortization: "PRICE" | "SAC";
		startDate: Date;
		firstDueDate: Date;
	},
	paidInstallments: number,
	targetDate: Date,
	advanceType: "FRONT" | "BACK",
	unpaidPrincipal: number,
	unpaidInterest: number,
): {
	totalToPay: number;
	savedInterest: number;
	remainingPrincipal: number;
} {
	const monthlyRate = Number(loan.interestRate);
	const remainingPrincipal = unpaidPrincipal;

	if (advanceType === "BACK") {
		// Back advance: Pay remaining principal without future interest

		return {
			remainingPrincipal,
			savedInterest: unpaidInterest,
			totalToPay: remainingPrincipal,
		};
	}
	// Front advance: Pay principal + accrued interest until target date
	const monthsToTarget = differenceInMonths(targetDate, new Date(loan.firstDueDate)) + 1;
	const accruedInterest = remainingPrincipal * monthlyRate * Math.max(0, monthsToTarget - paidInstallments);

	return {
		remainingPrincipal,
		savedInterest: Math.max(0, unpaidInterest - accruedInterest),
		totalToPay: remainingPrincipal + accruedInterest,
	};
}

export const LoansController = new Elysia({ prefix: "/loans" })
	.get(
		"/",
		async ({ request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(userId, "loans:list", {}, async () => {
				const loans = await queryRaw<LoanListRow>(
					`SELECT loan.*, COUNT(payment."id") FILTER (WHERE payment."paidDate" IS NOT NULL) AS "paidInstallments",
					        loan."totalInstallments" - COUNT(payment."id") FILTER (WHERE payment."paidDate" IS NOT NULL) AS "remainingInstallments",
					        COALESCE(SUM(payment."totalPaid") FILTER (WHERE payment."paidDate" IS NOT NULL), 0) AS "totalPaid",
					        COALESCE(SUM(payment."principalPaid") FILTER (WHERE payment."paidDate" IS NULL), 0) AS "remainingPrincipal"
					 FROM "public"."Loan" loan
					 LEFT JOIN "public"."LoanPayment" payment ON payment."loanId" = loan."id"
					 WHERE loan."userId" = $1
					 GROUP BY loan."id"
					 ORDER BY loan."startDate" DESC, loan."id" DESC`,
					[userId],
				);
				return loans.map(loan => ({
					...loan,
					installmentAmount: Number(loan.installmentAmount),
					interestRate: Number(loan.interestRate),
					paidInstallments: Number(loan.paidInstallments),
					principalAmount: Number(loan.principalAmount),
					remainingInstallments: Number(loan.remainingInstallments),
					remainingPrincipal: Number(loan.remainingPrincipal),
					totalPaid: Number(loan.totalPaid),
				}));
			});
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			return cached.value;
		},
		{
			detail: { tags: ["Loans"] },
			query: t.Object({}),
		},
	)
	.get(
		"/:id",
		async ({ params, request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"loans:detail",
				{ id: params.id, version: 2 },
				async () => {
					const loan = await queryFirst(
						db.sql.public.Loan.select(...loanColumns)
							.where((fields, functions) =>
								functions.and(functions.eq(fields.id, params.id), functions.eq(fields.userId, userId)),
							)
							.limit(1)
							.build(),
					);

					if (!loan) {
						throw new HttpException("Loan not found", 404);
					}

					return {
						...loan,
						installmentAmount: Number(loan.installmentAmount),
						interestRate: Number(loan.interestRate),
						principalAmount: Number(loan.principalAmount),
					};
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			return cached.value;
		},
		{
			detail: { tags: ["Loans"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.get(
		"/:id/payments",
		async ({ params, query, request, set }) => {
			const userId = await requireUserId(request);
			const limit = query.limit ?? 50;
			const filterHash = paymentFilterHash(userId, params.id);
			const cursor = decodePaymentCursor(query.cursor, filterHash);
			const cached = await distributedCache.remember(
				userId,
				"loans:installments",
				{ cursor: query.cursor, limit, loanId: params.id },
				async () => {
					await assertDirectOwnership("Loan", params.id, userId);
					const payments = await queryRows(
						db.sql.public.LoanPayment.select(...loanPaymentColumns)
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.loanId, params.id),
									...(cursor
										? [
												functions.raw`(${fields.installmentNumber}, ${fields.id}) > (${cursor.installmentNumber}, ${cursor.id})`.returns(
													"pg/bool@1",
												),
											]
										: []),
								),
							)
							.orderBy("installmentNumber", { direction: "asc" })
							.orderBy("id", { direction: "asc" })
							.limit(limit + 1)
							.build(),
					);
					return paymentPage(
						payments.map(payment => ({
							...payment,
							advanceType: payment.advanceType as "FRONT" | "BACK" | null,
							createdAt: payment.createdAt.toISOString(),
							dueDate: payment.dueDate.toISOString(),
							interestPaid: Number(payment.interestPaid),
							paidDate: payment.paidDate?.toISOString() ?? null,
							principalPaid: Number(payment.principalPaid),
							totalPaid: Number(payment.totalPaid),
							updatedAt: payment.updatedAt.toISOString(),
						})),
						limit,
						filterHash,
					);
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			return cached.value;
		},
		{
			detail: { tags: ["Loans"] },
			params: t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) }),
			query: t.Object({
				cursor: t.Optional(t.String()),
				limit: t.Optional(t.Integer({ maximum: 100, minimum: 1 })),
			}),
			response: LoanPaymentPageReturn,
		},
	)

	.get(
		"/:id/early-payoff",
		async ({ params, query, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Loan", params.id, userId);
			const loan = await queryFirst(
				db.sql.public.Loan.select(...loanColumns)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!loan) {
				throw new HttpException("Loan not found", 404);
			}

			const [paidPaymentCount] = await queryRaw<{ count: string; principal: string; interest: string }>(
				`SELECT COUNT(*) FILTER (WHERE "paidDate" IS NOT NULL) AS "count",
 COALESCE(SUM("principalPaid") FILTER (WHERE "paidDate" IS NULL), 0) AS "principal",
 COALESCE(SUM("interestPaid") FILTER (WHERE "paidDate" IS NULL), 0) AS "interest"
 FROM "public"."LoanPayment" WHERE "loanId" = $1`,
				[params.id],
			);
			const paidInstallments = Number(paidPaymentCount?.count ?? 0);

			const targetDate = query.targetDate ? new Date(query.targetDate) : new Date();
			const advanceType = query.advanceType ?? "BACK";

			const payoff = calculateEarlyPayoff(
				{
					amortization: loan.amortization as "PRICE" | "SAC",
					firstDueDate: new Date(loan.firstDueDate),
					interestRate: Number(loan.interestRate),
					principalAmount: Number(loan.principalAmount),
					startDate: new Date(loan.startDate),
					totalInstallments: loan.totalInstallments,
				},
				paidInstallments,
				targetDate,
				advanceType,
				Number(paidPaymentCount?.principal ?? 0),
				Number(paidPaymentCount?.interest ?? 0),
			);

			return {
				advanceType,
				loanId: loan.id,
				paidInstallments,
				targetDate,
				...payoff,
			};
		},
		{
			detail: { tags: ["Loans"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
			query: t.Object({
				advanceType: t.Optional(AdvanceType),
				targetDate: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			return withRawTransaction(async () => {
				const schedule = calculateLoanSchedule(
					body.principalAmount,
					body.interestRate,
					body.totalInstallments,
					body.amortization ?? "PRICE",
					new Date(body.startDate),
					new Date(body.firstDueDate),
				);
				const installmentAmount = schedule[0].total;

				const loan = await queryFirst(
					db.sql.public.Loan.insert([
						{
							amortization: body.amortization ?? "PRICE",
							description: body.description,
							dueDay: body.dueDay,
							firstDueDate: new Date(body.firstDueDate),
							installmentAmount: String(installmentAmount),
							interestRate: String(body.interestRate),
							lender: body.lender,
							principalAmount: String(body.principalAmount),
							startDate: new Date(body.startDate),
							totalInstallments: body.totalInstallments,
							userId,
						},
					])
						.returning(...loanColumns)
						.build(),
				);
				if (!loan) throw new HttpException("Loan not created", 500);

				const paymentEntries = schedule.map(inst => ({
					dueDate: inst.dueDate,
					installmentNumber: inst.installmentNumber,
					interestPaid: String(inst.interest),
					loanId: loan.id,
					principalPaid: String(inst.principal),
					totalPaid: String(inst.total),
				}));

				if (paymentEntries.length > 0)
					await executeStatement(db.sql.public.LoanPayment.insert(paymentEntries).build());

				return loan;
			});
		},
		{
			body: t.Object({
				amortization: t.Optional(AmortizationType),
				description: t.Optional(t.String({ maxLength: 500 })),
				dueDay: t.Number({ maximum: 31, minimum: 1 }),
				firstDueDate: t.String(),
				installmentAmount: t.Optional(t.Number()),
				interestRate: t.Number({ minimum: 0 }),
				lender: t.String({ maxLength: 100 }),
				principalAmount: t.Number({ exclusiveMinimum: 0 }),
				startDate: t.String(),
				totalInstallments: t.Integer({ maximum: 1200, minimum: 1 }),
			}),
			detail: { tags: ["Loans"] },
		},
	)
	.post(
		"/:id/payments/:installmentNumber/pay",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			return withRawTransaction(async () => {
				await assertDirectOwnership("Loan", params.id, userId);
				await queryRaw(`SELECT "id" FROM "Loan" WHERE "id" = $1 AND "userId" = $2 FOR UPDATE`, [
					params.id,
					userId,
				]);
				if (body.financialAccountId) await assertBalanceAccountOwnership(body.financialAccountId, userId);
				const payment = await queryFirst(
					db.sql.public.LoanPayment.select(...loanPaymentColumns)
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.loanId, params.id),
								functions.eq(fields.installmentNumber, Number(params.installmentNumber)),
							),
						)
						.limit(1)
						.build(),
				);

				if (!payment) {
					throw new HttpException("Payment not found", 404);
				}

				if (payment.paidDate) {
					throw new HttpException("Payment already made", 400);
				}

				const updatedPayment = await queryFirst(
					db.sql.public.LoanPayment.update({
						advanceType: body.advanceType,
						financialAccountId: body.financialAccountId,
						isAdvanced: body.isAdvanced ?? false,
						paidDate: body.paidDate ? new Date(body.paidDate) : new Date(),
						updatedAt: new Date(),
					})
						.where((fields, functions) => functions.eq(fields.id, payment.id))
						.returning(...loanPaymentColumns)
						.build(),
				);
				if (!updatedPayment) throw new HttpException("Payment not found", 404);

				return updatedPayment;
			});
		},
		{
			body: t.Object({
				advanceType: t.Optional(AdvanceType),
				financialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				isAdvanced: t.Optional(t.Boolean()),
				paidDate: t.Optional(t.String()),
			}),
			detail: { tags: ["Loans"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
				installmentNumber: t.String(),
			}),
		},
	)
	.post(
		"/:id/advance",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			return withRawTransaction(async () => {
				await assertDirectOwnership("Loan", params.id, userId);
				await queryRaw(`SELECT "id" FROM "Loan" WHERE "id" = $1 AND "userId" = $2 FOR UPDATE`, [
					params.id,
					userId,
				]);
				if (body.financialAccountId) await assertBalanceAccountOwnership(body.financialAccountId, userId);
				const loan = await queryFirst(
					db.sql.public.Loan.select("id")
						.where((fields, functions) => functions.eq(fields.id, params.id))
						.limit(1)
						.build(),
				);

				if (!loan) {
					throw new HttpException("Loan not found", 404);
				}

				// Get unpaid installments
				const unpaidPayments = await queryRows(
					db.sql.public.LoanPayment.select(...loanPaymentColumns)
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.loanId, params.id),
								functions.raw`${fields.paidDate} IS NULL`.returns("pg/bool@1"),
							),
						)
						.orderBy("installmentNumber", { direction: body.advanceType === "FRONT" ? "asc" : "desc" })
						.limit(body.installmentsToAdvance)
						.build(),
				);

				if (unpaidPayments.length === 0) {
					throw new HttpException("No unpaid installments to advance", 400);
				}

				// Mark installments as paid with advance
				const paidDate = body.paidDate ? new Date(body.paidDate) : new Date();

				await executeStatement(
					db.sql.public.LoanPayment.update({
						advanceType: body.advanceType,
						financialAccountId: body.financialAccountId,
						isAdvanced: true,
						paidDate,
						updatedAt: new Date(),
					})
						.where((fields, functions) =>
							functions.in(
								fields.id,
								unpaidPayments.map(payment => payment.id),
							),
						)
						.build(),
				);

				// Calculate total paid
				const totalPaid = unpaidPayments.reduce((sum, p) => sum + Number(p.totalPaid), 0);

				return {
					advancedInstallments: unpaidPayments.length,
					advanceType: body.advanceType,
					totalPaid,
				};
			});
		},
		{
			body: t.Object({
				advanceType: AdvanceType,
				financialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				installmentsToAdvance: t.Integer({ maximum: 1200, minimum: 1 }),
				paidDate: t.Optional(t.String()),
			}),
			detail: { tags: ["Loans"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.get(
		"/:id/history",
		async ({ params, query, request, set }) => {
			const userId = await requireUserId(request);
			const limit = Math.min(query.limit ?? 50, 100);
			const filterHash = paginationFilterHash(userId, { loanId: params.id });
			const cursor = decodePaginationCursor(query.cursor, filterHash, isLoanHistoryCursor);
			const cached = await distributedCache.remember(
				userId,
				"loans:history",
				{ cursor: query.cursor, limit, loanId: params.id },
				async () => {
					await assertDirectOwnership("Loan", params.id, userId);
					const history = await queryRows(
						db.sql.public.LoanHistory.select("id", "loanId", "field", "oldValue", "newValue", "changedAt")
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.loanId, params.id),
									...(cursor
										? [
												functions.raw`(${fields.changedAt}, ${fields.id}) < (${cursor.changedAt}::timestamp, ${cursor.id})`.returns(
													"pg/bool@1",
												),
											]
										: []),
								),
							)
							.orderBy("changedAt", { direction: "desc" })
							.orderBy("id", { direction: "desc" })
							.limit(limit + 1)
							.build(),
					);
					const hasMore = history.length > limit;
					const items = history.slice(0, limit);
					const last = items.at(-1);
					return {
						hasMore,
						items,
						nextCursor:
							hasMore && last
								? encodePaginationCursor({
										filterHash,
										value: { changedAt: last.changedAt.toISOString(), id: last.id },
									})
								: null,
					};
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			return cached.value;
		},
		{
			detail: { tags: ["Loans"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
			query: t.Object({
				cursor: t.Optional(t.String()),
				limit: t.Optional(t.Integer({ maximum: 100, minimum: 1 })),
			}),
		},
	);
