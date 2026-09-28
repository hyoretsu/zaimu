import {
	assertDateKey,
	installmentOccurrenceDate,
	purchaseStatementDates,
} from "@zaimu/finance/credit-purchase";
import {
	type CreditRefund,
	createCreditRefund,
	editCreditRefund,
	type RefundPolicy,
	resolveRefundPolicy,
} from "@zaimu/finance/credit-refund";
import {
	type RawQuery,
	replayNormalizedCard,
} from "~/modules/creditCards/application/normalized-statement-replay";
import { HttpException } from "~/shared/errors";
import { withRawTransaction } from "~/shared/infra/sql";

interface CardRow {
	id: string;
	dueDay: number;
	statementDay: number;
	institutionId: string | null;
	creditRefundPolicy: RefundPolicy | null;
}

interface PurchaseRow {
	id: string;
	totalAmount: number;
	creditCardId: string;
	purchaseDate: string;
}

interface RefundRow {
	id: string;
	purchaseId: string;
	amount: number;
	creditDate: string;
	statementId: string;
	policy: RefundPolicy;
	cancellationEligible: boolean;
	deletedAt: string | null;
}

const cents = (amount: number) => {
	if (!Number.isFinite(amount) || amount <= 0) throw new HttpException("Informe um valor válido", 400);
	const rounded = Math.round(amount * 100);
	if (!Number.isSafeInteger(rounded) || Math.abs(rounded / 100 - amount) > 1e-8)
		throw new HttpException("Informe o valor em centavos", 400);
	return rounded;
};

const normalizedRefund = (row: RefundRow): CreditRefund => ({
	amountCents: cents(row.amount),
	cancellationEligible: row.cancellationEligible,
	creditDate: row.creditDate,
	creditStatementId: row.statementId,
	id: row.id,
	policy: row.policy,
	purchaseId: row.purchaseId,
});

async function lockPurchase(query: RawQuery, userId: string, cardId: string, purchaseId: string) {
	// Card lock serializes invoice replay with other writes on the same card.
	const [card] = await query<CardRow>(
		`SELECT c."id", c."dueDay", c."statementDay", a."institutionId", i."creditRefundPolicy"
		 FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id" = c."financialAccountId"
		 LEFT JOIN "FinancialInstitution" i ON i."id" = a."institutionId"
		 WHERE c."id" = $1 AND a."userId" = $2 AND (a."institutionId" IS NULL OR i."userId" = $2) FOR UPDATE OF c`,
		[cardId, userId],
	);
	if (!card) throw new HttpException("Cartão não encontrado", 404);
	const [purchase] = await query<PurchaseRow>(
		`SELECT "id", "totalAmount", "creditCardId", "purchaseDate"::text AS "purchaseDate" FROM "CreditPurchaseRecord"
		 WHERE "id" = $1 AND "creditCardId" = $2 AND "userId" = $3 FOR UPDATE`,
		[purchaseId, cardId, userId],
	);
	if (!purchase) throw new HttpException("Compra não encontrada", 404);
	return { card, purchase };
}

async function refundRows(query: RawQuery, purchaseId: string) {
	return query<RefundRow>(
		`SELECT "id", "purchaseId", "amount", "creditDate"::text AS "creditDate", "statementId",
		 "policy", "cancellationEligible", "deletedAt"::text AS "deletedAt"
		 FROM "CreditRefundRecord" WHERE "purchaseId" = $1 ORDER BY "createdAt", "id"`,
		[purchaseId],
	);
}

async function creditStatement(query: RawQuery, card: CardRow, creditDate: string) {
	const { statementDate, dueDate } = purchaseStatementDates(card, creditDate);
	const [registered] = await query<{ id: string; statementDate: string }>(
		`SELECT "id", "statementDate"::text AS "statementDate" FROM "CreditCardStatement"
		 WHERE "creditCardId" = $1 AND "statementDate" >= $2 ORDER BY "statementDate", "id" LIMIT 1`,
		[card.id, creditDate],
	);
	if (registered && registered.statementDate.slice(0, 7) <= statementDate.slice(0, 7)) return registered.id;
	await query(
		`INSERT INTO "CreditCardStatement" ("creditCardId", "statementDate", "dueDate", "totalAmount")
		 VALUES ($1, $2, $3, 0) ON CONFLICT ("creditCardId", "statementDate") DO NOTHING`,
		[card.id, statementDate, dueDate],
	);
	const [statement] = await query<{ id: string }>(
		`SELECT "id" FROM "CreditCardStatement" WHERE "creditCardId" = $1 AND "statementDate" = $2`,
		[card.id, statementDate],
	);
	if (!statement) throw new HttpException("Fatura do reembolso não encontrada", 409);
	return statement.id;
}

async function saveInstitutionPolicy(query: RawQuery, institutionId: string, policy: RefundPolicy) {
	const updated = await query<{ creditRefundPolicy: RefundPolicy }>(
		`UPDATE "FinancialInstitution" SET "creditRefundPolicy" = $1, "updatedAt" = CURRENT_TIMESTAMP
		 WHERE "id" = $2 AND "creditRefundPolicy" IS NULL RETURNING "creditRefundPolicy"`,
		[policy, institutionId],
	);
	if (updated.length) return;
	const [current] = await query<{ creditRefundPolicy: RefundPolicy }>(
		`SELECT "creditRefundPolicy" FROM "FinancialInstitution" WHERE "id" = $1`,
		[institutionId],
	);
	if (current?.creditRefundPolicy !== policy)
		throw new HttpException("Política de reembolso da instituição já definida", 409);
}

export interface RefundMutationContext {
	cardId: string;
	purchaseId: string;
	userId: string;
}

export async function createNormalizedRefund(
	context: RefundMutationContext,
	input: { amount?: number; creditDate: string; policy?: RefundPolicy },
) {
	return withRawTransaction(async query => {
		const { card, purchase } = await lockPurchase(query, context.userId, context.cardId, context.purchaseId);
		const previous = await refundRows(query, purchase.id);
		const active = previous.filter(row => !row.deletedAt).map(normalizedRefund);
		const totalAmountCents = cents(purchase.totalAmount);
		const amountCents = input.amount === undefined ? undefined : cents(input.amount);
		const refundedCents = active.reduce((sum, refund) => sum + refund.amountCents, 0);
		const isFirstFull =
			previous.length === 0 && (amountCents ?? totalAmountCents - refundedCents) === totalAmountCents;
		const plans = await query<{
			number: number;
			statementDate: string | null;
			settledByPurchaseId: string | null;
		}>(
			`SELECT plan."number", statement."statementDate"::text AS "statementDate", occurrence."settledByPurchaseId"
			 FROM "CreditInstallmentPlan" plan
			 LEFT JOIN "CreditInstallmentRecord" occurrence ON occurrence."purchaseId" = plan."purchaseId" AND occurrence."number" = plan."number"
			 LEFT JOIN "CreditCardStatement" statement ON statement."id" = occurrence."statementId"
			 WHERE plan."purchaseId" = $1`,
			[purchase.id],
		);
		assertDateKey(input.creditDate);
		const statementId = await creditStatement(query, card, input.creditDate);
		const [creditStatementRow] = await query<{ statementDate: string }>(
			`SELECT "statementDate"::text AS "statementDate" FROM "CreditCardStatement" WHERE "id" = $1`,
			[statementId],
		);
		if (!creditStatementRow) throw new HttpException("Fatura do reembolso não encontrada", 409);
		const creditCycle = creditStatementRow.statementDate;
		const hasFutureInstallments = plans.some(plan => {
			if (plan.settledByPurchaseId) return false;
			const occurrenceDate = installmentOccurrenceDate(purchase.purchaseDate, plan.number);
			const cycle = plan.statementDate ?? purchaseStatementDates(card, occurrenceDate).statementDate;
			return cycle > creditCycle;
		});
		const decision = resolveRefundPolicy({
			institutionId: card.institutionId,
			needsCancellationDecision: isFirstFull && hasFutureInstallments,
			requestedPolicy: input.policy,
			savedPolicy: card.creditRefundPolicy,
		});
		if (decision.saveInstitutionPolicy && card.institutionId)
			await saveInstitutionPolicy(query, card.institutionId, decision.policy);
		const refund = createCreditRefund({ id: purchase.id, totalAmountCents }, active, {
			amountCents,
			creditDate: input.creditDate,
			creditStatementId: statementId,
			hasPreviousRefundHistory: previous.length > 0,
			id: crypto.randomUUID(),
			policy: decision.policy,
		});
		await query(
			`INSERT INTO "CreditRefundRecord"
			 ("id", "purchaseId", "statementId", "creditDate", "amount", "policy", "cancellationEligible")
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			[
				refund.id,
				purchase.id,
				statementId,
				refund.creditDate,
				refund.amountCents / 100,
				refund.policy,
				refund.cancellationEligible,
			],
		);
		await replayNormalizedCard(query, card.id);
		return refund;
	});
}

export async function editNormalizedRefund(
	context: RefundMutationContext,
	refundId: string,
	changes: { amount?: number; creditDate?: string },
) {
	return withRawTransaction(async query => {
		const { card, purchase } = await lockPurchase(query, context.userId, context.cardId, context.purchaseId);
		const active = (await refundRows(query, purchase.id)).filter(row => !row.deletedAt).map(normalizedRefund);
		const statementId = changes.creditDate
			? await creditStatement(query, card, changes.creditDate)
			: undefined;
		const edited = editCreditRefund(
			{ id: purchase.id, totalAmountCents: cents(purchase.totalAmount) },
			active,
			refundId,
			{
				...(changes.amount !== undefined && { amountCents: cents(changes.amount) }),
				...(changes.creditDate && { creditDate: changes.creditDate, creditStatementId: statementId }),
			},
		);
		await query(
			`UPDATE "CreditRefundRecord" SET "amount" = $1, "creditDate" = $2, "statementId" = $3,
			 "cancellationEligible" = $4, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $5`,
			[
				edited.amountCents / 100,
				edited.creditDate,
				edited.creditStatementId,
				edited.cancellationEligible,
				refundId,
			],
		);
		await replayNormalizedCard(query, card.id);
		return edited;
	});
}

export async function deleteNormalizedRefund(context: RefundMutationContext, refundId: string) {
	return withRawTransaction(async query => {
		const { card, purchase } = await lockPurchase(query, context.userId, context.cardId, context.purchaseId);
		const [refund] = (await refundRows(query, purchase.id)).filter(
			row => !row.deletedAt && row.id === refundId,
		);
		if (!refund) throw new HttpException("Reembolso não encontrado", 404);
		await query(
			`UPDATE "CreditRefundRecord" SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
			 WHERE "id" = $1`,
			[refundId],
		);
		await replayNormalizedCard(query, card.id);
	});
}
