import { materializeBookInstallments } from "@zaimu/finance/credit-book";
import { purchaseStatementDates } from "@zaimu/finance/credit-purchase";
import { addDays, addMonths, addWeeks, addYears, format, isAfter, startOfDay } from "date-fns";
import { getTagsByEntity, tagEntityType } from "~/modules/categories/application/tag-assignments";
import { getDebtSplitInput } from "~/modules/debts/application";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, param, queryFirst, queryRows } from "~/shared/infra/sql";
import { mutateCreditBook, newBookPurchase, readCreditBook } from "./normalized-credit-book";

const statementColumns = [
	"id",
	"creditCardId",
	"statementDate",
	"dueDate",
	"totalAmount",
	"paidAmount",
	"isPaid",
	"isFullySynced",
	"createdAt",
	"updatedAt",
] as const;

export type SubscriptionFrequency = "BIWEEKLY" | "DAILY" | "MONTHLY" | "WEEKLY" | "YEARLY";

export function subscriptionOccurrences(
	subscription: {
		billingDay: number;
		dayOfWeek?: number | null;
		endDate: Date | null;
		frequency: SubscriptionFrequency;
		startDate: Date;
	},
	until: Date,
) {
	const occurrences: Date[] = [];
	const start = startOfDay(subscription.startDate);
	const end = startOfDay(subscription.endDate && subscription.endDate < until ? subscription.endDate : until);
	let occurrence = start;
	if (
		subscription.frequency === "WEEKLY" &&
		subscription.dayOfWeek !== null &&
		subscription.dayOfWeek !== undefined
	)
		occurrence = addDays(start, (subscription.dayOfWeek - start.getDay() + 7) % 7);
	let yearOffset = 0;
	if (subscription.frequency === "MONTHLY") {
		const first = new Date(
			start.getFullYear(),
			start.getMonth(),
			Math.min(subscription.billingDay, new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()),
		);
		occurrence =
			first < start
				? new Date(
						start.getFullYear(),
						start.getMonth() + 1,
						Math.min(
							subscription.billingDay,
							new Date(start.getFullYear(), start.getMonth() + 2, 0).getDate(),
						),
					)
				: first;
	}
	while (!isAfter(occurrence, end)) {
		occurrences.push(occurrence);
		switch (subscription.frequency) {
			case "DAILY":
				occurrence = addDays(occurrence, 1);
				break;
			case "WEEKLY":
				occurrence = addWeeks(occurrence, 1);
				break;
			case "BIWEEKLY":
				occurrence = addWeeks(occurrence, 2);
				break;
			case "MONTHLY": {
				const nextMonth = new Date(occurrence.getFullYear(), occurrence.getMonth() + 1, 1);
				occurrence = new Date(
					nextMonth.getFullYear(),
					nextMonth.getMonth(),
					Math.min(
						subscription.billingDay,
						new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate(),
					),
				);
				break;
			}
			case "YEARLY":
				yearOffset += 1;
				occurrence = addYears(start, yearOffset);
				break;
		}
	}
	return occurrences;
}

export function getStatementDates(
	card: { dueDay: number; statementDay: number; workingDueDate?: boolean },
	purchaseDate: Date,
) {
	const dates = purchaseStatementDates(card, purchaseDate.toISOString().slice(0, 10));
	return {
		dueDate: new Date(`${dates.dueDate}T12:00:00Z`),
		statementDate: new Date(`${dates.statementDate}T12:00:00Z`),
	};
}

export async function getOrCreateStatement(creditCardId: string, dueDate: Date, statementDate: Date) {
	await queryFirst(
		db.raw.sql`
			INSERT INTO "CreditCardStatement" ("creditCardId", "dueDate", "statementDate", "totalAmount")
			VALUES (
				${param(creditCardId, { codecId: "sql/varchar@1" })},
				${param(dueDate, { codecId: "pg/date@1" })},
				${param(statementDate, { codecId: "pg/date@1" })},
				0
			)
			ON CONFLICT ("creditCardId", "statementDate") DO NOTHING
			RETURNING "id"
		`
			.returnsRow({ id: db.sql.public.CreditCardStatement.columns.id })
			.build(),
	);
	const statement = await queryFirst(
		db.sql.public.CreditCardStatement.select(...statementColumns)
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.creditCardId, creditCardId),
					functions.eq(fields.statementDate, statementDate),
				),
			)
			.limit(1)
			.build(),
	);
	if (!statement) throw new HttpException("Statement not created", 500);
	return statement;
}

async function materializeMonthlyStatements(
	creditCardId: string,
	card: { createdAt: Date; dueDay: number; statementDay: number; workingDueDate?: boolean },
	today: Date,
) {
	const oldestStatement = await queryFirst(
		db.sql.public.CreditCardStatement.select("statementDate")
			.where((fields, functions) => functions.eq(fields.creditCardId, creditCardId))
			.orderBy("statementDate", { direction: "asc" })
			.limit(1)
			.build(),
	);
	const firstStatementDate =
		oldestStatement?.statementDate ?? getStatementDates(card, card.createdAt).statementDate;
	const lastStatementDate = getStatementDates(card, today).statementDate;
	let month = new Date(firstStatementDate.getFullYear(), firstStatementDate.getMonth(), 1);
	const lastMonth = new Date(lastStatementDate.getFullYear(), lastStatementDate.getMonth(), 1);
	while (month <= lastMonth) {
		const { dueDate, statementDate } = getStatementDates(card, month);
		await getOrCreateStatement(creditCardId, dueDate, statementDate);
		month = addMonths(month, 1);
	}
}

async function materializeDueSubscriptionPurchases(
	creditCardId: string,
	financialAccountId: string,
	card: {
		cashbackAccountId: string | null;
		cashbackRate: number | null;
		cashbackYieldPeriod: string | null;
		cashbackYieldReferencePercentage: number | null;
		cashbackYieldReferenceRate: number | null;
		dueDay: number;
		statementDay: number;
	},
	today: Date,
) {
	const subscriptions = await queryRows(
		db.sql.public.Subscription.select(
			"amount",
			"billingDay",
			"dayOfWeek",
			"endDate",
			"frequency",
			"id",
			"materializedThrough",
			"name",
			"startDate",
			"storeName",
			"userId",
		)
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.financialAccountId, financialAccountId),
					functions.eq(fields.isActive, true),
					functions.eq(fields.paymentMethod, "CREDIT"),
				),
			)
			.build(),
	);
	if (subscriptions.length === 0) return;
	const tagsBySubscription = await getTagsByEntity(
		tagEntityType.subscription,
		subscriptions.map(s => s.id),
	);
	if (!subscriptions.length) return;
	await mutateCreditBook(subscriptions[0]!.userId, creditCardId, async book => {
		for (const subscription of subscriptions) {
			const debtSplit = await getDebtSplitInput({ subscriptionId: subscription.id });
			for (const occurrence of subscriptionOccurrences(
				subscription as typeof subscription & { frequency: SubscriptionFrequency },
				today,
			)) {
				if (!isAfter(occurrence, startOfDay(subscription.materializedThrough))) continue;
				const key = occurrence.toISOString().slice(0, 10);
				if (
					book.purchases.some(
						p => p.subscriptionId === subscription.id && p.subscriptionOccurrenceDate === key,
					)
				)
					continue;
				newBookPurchase(book, {
					cashbackAccountId: card.cashbackAccountId,
					cashbackAmount:
						card.cashbackAccountId && card.cashbackRate
							? Number(((Number(subscription.amount) * card.cashbackRate) / 100).toFixed(4))
							: null,
					cashbackYieldPeriod: card.cashbackYieldPeriod as "MONTHLY" | "YEARLY" | null,
					cashbackYieldReferencePercentage: card.cashbackYieldReferencePercentage,
					cashbackYieldReferenceRate: card.cashbackYieldReferenceRate,
					debtSplitRule: debtSplit ?? null,
					description: subscription.name,
					installments: 1,
					purchaseDate: key,
					storeName: subscription.storeName,
					subscriptionId: subscription.id,
					subscriptionOccurrenceDate: key,
					tagIds: (tagsBySubscription.get(subscription.id) ?? []).map(t => t.id),
					totalAmount: Number(subscription.amount),
				});
			}
			await executeStatement(
				db.sql.public.Subscription.update({ materializedThrough: startOfDay(today) } as never)
					.where((f, fn) => fn.eq(f.id, subscription.id))
					.build(),
			);
		}
	});
}

export async function materializeCreditCardSchedules(asOf = new Date()) {
	const cards = await queryRows(
		db.sql.public.CreditCard.select(
			"cashbackAccountId",
			"cashbackRate",
			"cashbackYieldPeriod",
			"cashbackYieldReferencePercentage",
			"cashbackYieldReferenceRate",
			"createdAt",
			"dueDay",
			"financialAccountId",
			"id",
			"statementDay",
			"workingDueDate",
		).build(),
	);
	const accounts = await queryRows(
		db.sql.public.FinancialAccount.select("id", "userId")
			.where((fields, functions) =>
				functions.in(
					fields.id,
					cards.map(card => card.financialAccountId),
				),
			)
			.build(),
	);
	const owners = new Map(accounts.map(account => [account.id, account.userId]));
	for (const card of cards) {
		await materializeMonthlyStatements(card.id, card, asOf);
		await materializeDueSubscriptionPurchases(card.id, card.financialAccountId, card, asOf);
		const owner = owners.get(card.financialAccountId)!;
		const book = await readCreditBook(owner, card.id);
		const before = book.installments.length;
		materializeBookInstallments(book, format(asOf, "yyyy-MM-dd"));
		if (book.installments.length !== before)
			await mutateCreditBook(owner, card.id, () => undefined, format(asOf, "yyyy-MM-dd"));
	}
	return { cards: cards.length, userIds: [...new Set(accounts.map(account => account.userId))] };
}
