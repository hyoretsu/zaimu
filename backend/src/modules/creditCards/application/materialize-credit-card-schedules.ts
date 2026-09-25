import { addDays, addMonths, addWeeks, addYears, isAfter, startOfDay } from "date-fns";
import {
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { getDebtSplitInput, linkPurchaseToDebt } from "~/modules/debts/application";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, numeric, param, queryFirst, queryRows } from "~/shared/infra/sql";

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

export function getStatementDates(card: { dueDay: number; statementDay: number }, purchaseDate: Date) {
	const statementMonth =
		purchaseDate.getDate() > card.statementDay ? addMonths(purchaseDate, 1) : purchaseDate;
	const statementDate = new Date(statementMonth.getFullYear(), statementMonth.getMonth(), card.statementDay);
	const dueDate = new Date(statementMonth.getFullYear(), statementMonth.getMonth(), card.dueDay);
	if (dueDate <= statementDate) dueDate.setMonth(dueDate.getMonth() + 1);
	return { dueDate, statementDate };
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
	card: { createdAt: Date; dueDay: number; statementDay: number },
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
	const existing = await queryRows(
		db.sql.public.CreditPurchase.select("subscriptionId", "subscriptionOccurrenceDate")
			.where((fields, functions) =>
				functions.in(
					fields.subscriptionId,
					subscriptions.map(item => item.id),
				),
			)
			.build(),
	);
	const materialized = new Set(
		existing.flatMap(purchase =>
			purchase.subscriptionId && purchase.subscriptionOccurrenceDate
				? [`${purchase.subscriptionId}:${purchase.subscriptionOccurrenceDate.toISOString().slice(0, 10)}`]
				: [],
		),
	);
	const tagsBySubscription = await getTagsByEntity(
		tagEntityType.subscription,
		subscriptions.map(item => item.id),
	);
	for (const subscription of subscriptions) {
		for (const occurrenceDate of subscriptionOccurrences(
			subscription as typeof subscription & { frequency: SubscriptionFrequency },
			today,
		)) {
			if (!isAfter(occurrenceDate, startOfDay(subscription.materializedThrough))) continue;
			const occurrenceKey = `${subscription.id}:${occurrenceDate.toISOString().slice(0, 10)}`;
			if (materialized.has(occurrenceKey)) continue;
			const { dueDate, statementDate } = getStatementDates(card, occurrenceDate);
			const statement = await getOrCreateStatement(creditCardId, dueDate, statementDate);
			const purchase = await queryFirst(
				db.raw.sql`
					INSERT INTO "CreditPurchase" (
						"cashbackAccountId", "cashbackAmount", "cashbackYieldPeriod",
						"cashbackYieldReferencePercentage", "cashbackYieldReferenceRate", "currentInstallment",
						"description", "installmentAmount", "installments", "purchaseDate", "statementId",
						"storeName", "subscriptionId", "subscriptionOccurrenceDate", "time", "totalAmount", "userId"
					) VALUES (
						${param(card.cashbackAccountId, { codecId: "sql/varchar@1" })},
						${param(card.cashbackAccountId && card.cashbackRate ? numeric<18, 4>((Number(subscription.amount) * card.cashbackRate) / 100) : null, { codecId: "pg/numeric@1" })},
						${param(card.cashbackYieldPeriod, { codecId: "sql/varchar@1" })}::"CashbackYieldPeriod",
						${param(card.cashbackYieldReferencePercentage === null ? null : numeric<7, 4>(card.cashbackYieldReferencePercentage), { codecId: "pg/numeric@1" })},
						${param(card.cashbackYieldReferenceRate === null ? null : numeric<7, 4>(card.cashbackYieldReferenceRate), { codecId: "pg/numeric@1" })},
						1, ${param(subscription.name, { codecId: "sql/varchar@1" })},
						${param(numeric<12, 2>(subscription.amount), { codecId: "pg/numeric@1" })}, 1,
						${param(occurrenceDate, { codecId: "pg/date@1" })}, ${param(statement.id, { codecId: "sql/varchar@1" })},
						${param(subscription.storeName, { codecId: "sql/varchar@1" })}, ${param(subscription.id, { codecId: "sql/varchar@1" })},
						${param(occurrenceDate, { codecId: "pg/date@1" })}, NULL,
						${param(numeric<12, 2>(subscription.amount), { codecId: "pg/numeric@1" })},
						${param(subscription.userId, { codecId: "sql/varchar@1" })}
					) ON CONFLICT ("subscriptionId", "subscriptionOccurrenceDate") DO NOTHING RETURNING "id"
				`
					.returnsRow({ id: db.sql.public.CreditPurchase.columns.id })
					.build(),
			);
			if (!purchase) continue;
			materialized.add(occurrenceKey);
			const debtSplit = await getDebtSplitInput({ subscriptionId: subscription.id });
			if (debtSplit)
				await linkPurchaseToDebt({
					creditPurchaseId: purchase.id,
					date: occurrenceDate.toISOString().slice(0, 10),
					debtSplit,
					description: subscription.name,
					totalAmount: Number(subscription.amount),
					userId: subscription.userId,
				});
			await replaceEntityTags({
				entityIds: [purchase.id],
				entityType: tagEntityType.creditPurchase,
				tagIds: (tagsBySubscription.get(subscription.id) ?? []).map(tag => tag.id),
			});
			const amount = param(numeric<12, 2>(subscription.amount), { codecId: "pg/numeric@1" });
			await executeStatement(
				db.sql.public.CreditCardStatement.update((fields, functions) => ({
					totalAmount: functions.raw`${fields.totalAmount} + ${amount}`.returns("pg/numeric@1"),
					updatedAt: functions.raw`CURRENT_TIMESTAMP`.returns("pg/timestamp@1"),
				}))
					.where((fields, functions) => functions.eq(fields.id, statement.id))
					.build(),
			);
		}
		await executeStatement(
			db.sql.public.Subscription.update({ materializedThrough: startOfDay(today) } as never)
				.where((fields, functions) => functions.eq(fields.id, subscription.id))
				.build(),
		);
	}
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
		).build(),
	);
	for (const card of cards) {
		await materializeMonthlyStatements(card.id, card, asOf);
		await materializeDueSubscriptionPurchases(card.id, card.financialAccountId, card, asOf);
	}
	return { cards: cards.length };
}
