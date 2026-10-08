import { currentDateKey, statementCycles } from "@zaimu/finance/credit-card";
import {
	type CreditPurchase,
	installmentOccurrenceDate,
	purchaseStatementDates,
} from "@zaimu/finance/credit-purchase";
import type { CreditRefund } from "@zaimu/finance/credit-refund";
import { currencyScale } from "@zaimu/finance/money";
import {
	type PurchaseInvoiceInstallment,
	rebuildPurchaseStatementLedger,
} from "@zaimu/finance/purchase-statement-ledger";
import { HttpException } from "~/shared/errors";
import type { withRawTransaction } from "~/shared/infra/sql";

export type RawQuery = Parameters<Parameters<typeof withRawTransaction>[0]>[0];

interface CardRow {
	currency: string;
	id: string;
	dueDay: number;
	workingDueDate: boolean;
	statementDay: number;
	ignoreStatementsBefore: string | null;
}
interface PurchaseRow {
	id: string;
	creditCardId: string;
	description: string;
	storeName: string | null;
	purchaseDate: string;
	totalAmount: number;
}
interface PlanRow {
	purchaseId: string;
	number: number;
	amount: number;
}
interface InstallmentRow extends PlanRow {
	statementId: string;
	settledByPurchaseId: string | null;
}
interface RefundRow {
	id: string;
	purchaseId: string;
	statementId: string;
	creditDate: string;
	amount: number;
	policy: CreditRefund["policy"];
	cancellationEligible: boolean;
}
interface StatementRow {
	id: string;
	creditCardId: string;
	statementDate: string;
	dueDate: string;
	totalAmount: number;
	paidAmount: number;
}
interface ChargeRow {
	statementId: string;
	amount: number;
}
interface PaymentRow {
	amount: number;
	date: string;
}

/** Rebuilds the complete chronological card chain inside the same locked refund transaction. */
export async function replayNormalizedCard(query: RawQuery, cardId: string) {
	const [card] = await query<CardRow>(
		`SELECT "id", "currency", "dueDay", "statementDay", "workingDueDate", "ignoreStatementsBefore"::text AS "ignoreStatementsBefore" FROM "CreditCard" WHERE "id" = $1`,
		[cardId],
	);
	if (!card) throw new HttpException("Cartão não encontrado", 404);
	const cents = (amount: number) => Math.round(amount * currencyScale(card.currency));
	const [purchaseRows, planRows, concreteRows, refundRows, existingStatements, chargeRows, payments] = [
		await query<PurchaseRow>(
			`SELECT "id", "creditCardId", "description", "storeName",
				 "purchaseDate"::text AS "purchaseDate", "totalAmount"
				 FROM "CreditPurchaseRecord" WHERE "creditCardId" = $1`,
			[cardId],
		),
		await query<PlanRow>(
			`SELECT plan."purchaseId", plan."number", plan."amount" FROM "CreditInstallmentPlan" plan
				 JOIN "CreditPurchaseRecord" purchase ON purchase."id" = plan."purchaseId"
				 WHERE purchase."creditCardId" = $1 ORDER BY plan."purchaseId", plan."number"`,
			[cardId],
		),
		await query<InstallmentRow>(
			`SELECT occurrence."purchaseId", occurrence."number", occurrence."amount",
				 occurrence."statementId", occurrence."settledByPurchaseId"
				 FROM "CreditInstallmentRecord" occurrence
				 JOIN "CreditPurchaseRecord" purchase ON purchase."id" = occurrence."purchaseId"
				 WHERE purchase."creditCardId" = $1`,
			[cardId],
		),
		await query<RefundRow>(
			`SELECT refund."id", refund."purchaseId", refund."statementId",
				 refund."creditDate"::text AS "creditDate", refund."amount", refund."policy",
				 refund."cancellationEligible" FROM "CreditRefundRecord" refund
				 JOIN "CreditPurchaseRecord" purchase ON purchase."id" = refund."purchaseId"
				 WHERE purchase."creditCardId" = $1 AND refund."deletedAt" IS NULL`,
			[cardId],
		),
		await query<StatementRow>(
			`SELECT "id", "creditCardId", "statementDate"::text AS "statementDate",
				 "dueDate"::text AS "dueDate", "totalAmount", "paidAmount"
				 FROM "CreditCardStatement" WHERE "creditCardId" = $1`,
			[cardId],
		),
		await query<ChargeRow>(
			`SELECT charge."statementId", charge."amount" FROM "CreditStatementCharge" charge
				 JOIN "CreditCardStatement" statement ON statement."id" = charge."statementId"
				 WHERE statement."creditCardId" = $1 AND charge."isSettled" = false`,
			[cardId],
		),
		await query<PaymentRow>(
			`SELECT "amount", "date"::text AS "date" FROM "Transaction"
				 WHERE "paymentCreditCardId" = $1`,
			[cardId],
		),
	];
	const plansByPurchase = Map.groupBy(planRows, row => row.purchaseId);
	const purchases: CreditPurchase[] = purchaseRows.map(row => ({
		creditCardId: row.creditCardId,
		description: row.description,
		id: row.id,
		installmentAmountsCents: (plansByPurchase.get(row.id) ?? []).map(plan => cents(plan.amount)),
		purchaseDate: row.purchaseDate,
		storeName: row.storeName,
		tagIds: [],
		totalAmountCents: cents(row.totalAmount),
	}));
	const statements = [...existingStatements];
	const byDate = new Map(statements.map(statement => [statement.statementDate, statement]));
	const concreteByNumber = new Map(concreteRows.map(row => [`${row.purchaseId}\u0000${row.number}`, row]));
	const installments: PurchaseInvoiceInstallment[] = [];
	for (const purchase of purchases) {
		for (const plan of plansByPurchase.get(purchase.id) ?? []) {
			const concrete = concreteByNumber.get(`${purchase.id}\u0000${plan.number}`);
			const occurrenceDate = installmentOccurrenceDate(purchase.purchaseDate, plan.number);
			const { dueDate, statementDate: key } = purchaseStatementDates(card, occurrenceDate);
			let statement = byDate.get(key);
			if (!statement) {
				statement = {
					creditCardId: card.id,
					dueDate,
					id: `forecast-${key}`,
					paidAmount: 0,
					statementDate: key,
					totalAmount: 0,
				};
				statements.push(statement);
				byDate.set(key, statement);
			}
			installments.push({
				amountCents: cents(plan.amount),
				isSettled: Boolean(concrete?.settledByPurchaseId),
				number: plan.number,
				purchaseId: purchase.id,
				statementId: concrete?.statementId ?? statement.id,
			});
		}
	}
	const charges = new Map<string, number>();
	for (const charge of chargeRows)
		charges.set(charge.statementId, (charges.get(charge.statementId) ?? 0) + cents(charge.amount));
	const asOf = currentDateKey();
	const cycles = statementCycles(
		statements.map(statement => ({
			...statement,
			chargesAmount: (charges.get(statement.id) ?? 0) / currencyScale(card.currency),
		})),
		card,
		payments,
		dates => ({
			chargesAmount: 0,
			creditCardId: card.id,
			dueDate: dates.dueDate,
			id: `cycle-${dates.statementDate}`,
			paidAmount: 0,
			statementDate: dates.statementDate,
			totalAmount: 0,
		}),
		asOf,
	);
	const refunds: CreditRefund[] = refundRows.map(row => ({
		amountCents: cents(row.amount),
		cancellationEligible: row.cancellationEligible,
		creditDate: row.creditDate,
		creditStatementId: row.statementId,
		id: row.id,
		policy: row.policy,
		purchaseId: row.purchaseId,
	}));
	const replayed = rebuildPurchaseStatementLedger({
		asOf,
		currency: card.currency,
		ignoreBefore: card.ignoreStatementsBefore,
		installments,
		payments,
		purchases,
		refunds,
		statements: cycles,
	});
	for (const statement of replayed.statements) {
		if (statement.id.startsWith("forecast-")) continue;
		const totalAmount = statement.totalAmount + (statement.chargesAmount ?? 0);
		if (statement.id.startsWith("cycle-")) {
			if (statement.statementDate > asOf) continue;
			await query(
				`INSERT INTO "CreditCardStatement" ("creditCardId", "statementDate", "dueDate", "totalAmount", "paidAmount", "isPaid")
				 VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ("creditCardId", "statementDate") DO NOTHING`,
				[
					card.id,
					statement.statementDate,
					statement.dueDate,
					totalAmount,
					statement.paidAmount,
					statement.isPaid,
				],
			);
			continue;
		}
		await query(
			`UPDATE "CreditCardStatement" SET "totalAmount" = $1, "paidAmount" = $2,
			 "isPaid" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $4`,
			[totalAmount, statement.paidAmount, statement.isPaid, statement.id],
		);
	}
}
