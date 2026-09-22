import { addDays, addWeeks, addYears, format, isAfter, startOfDay } from "date-fns";
import {
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { db, executeStatement, numeric, param, queryFirst, queryRows } from "~/shared/infra/sql";

type SalaryFrequency = "BIWEEKLY" | "DAILY" | "MONTHLY" | "WEEKLY" | "YEARLY";

export function salaryOccurrenceDates(
	frequency: SalaryFrequency,
	startDate: Date,
	payDay: number,
	endDate?: Date | null,
	today = new Date(),
	dayOfWeek?: number | null,
): string[] {
	const occurrences: string[] = [];
	const currentDay = startOfDay(today);
	const end = endDate ? startOfDay(endDate) : currentDay;
	const start = startOfDay(startDate);
	let monthOffset = 0;
	let yearOffset = 0;
	let occurrence = frequency === "MONTHLY" ? monthlyOccurrence(start, payDay) : start;
	if (frequency === "WEEKLY" && dayOfWeek !== null && dayOfWeek !== undefined)
		occurrence = addDays(start, (dayOfWeek - start.getDay() + 7) % 7);

	while (!isAfter(occurrence, currentDay) && !isAfter(occurrence, end)) {
		occurrences.push(format(occurrence, "yyyy-MM-dd"));
		switch (frequency) {
			case "DAILY":
				occurrence = addDays(occurrence, 1);
				break;
			case "WEEKLY":
				occurrence = addWeeks(occurrence, 1);
				break;
			case "BIWEEKLY":
				occurrence = addWeeks(occurrence, 2);
				break;
			case "MONTHLY":
				monthOffset += 1;
				occurrence = monthlyOccurrence(start, payDay, monthOffset);
				break;
			case "YEARLY":
				yearOffset += 1;
				occurrence = addYears(start, yearOffset);
				break;
		}
	}

	return occurrences;
}

function monthlyOccurrence(start: Date, payDay: number, monthOffset = 0): Date {
	const month = new Date(start.getFullYear(), start.getMonth() + monthOffset, 1);
	const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
	return new Date(month.getFullYear(), month.getMonth(), Math.min(payDay, lastDay));
}

export async function materializeSalaryTransactions(userId: string) {
	const today = startOfDay(new Date());
	const salaries = await queryRows(
		db.sql.public.Salary.select(
			"id",
			"amount",
			"endDate",
			"financialAccountId",
			"frequency",
			"materializedThrough",
			"payDay",
			"dayOfWeek",
			"source",
			"startDate",
		)
			.where((fields, functions) =>
				functions.and(functions.eq(fields.userId, userId), functions.eq(fields.isActive, true)),
			)
			.build(),
	);
	const tagsBySalary = await getTagsByEntity(
		tagEntityType.salary,
		salaries.map(salary => salary.id),
	);

	for (const salary of salaries) {
		if (!salary.financialAccountId) continue;
		const transactions = await queryRows(
			db.sql.public.Transaction.select("salaryOccurrenceDate")
				.where((fields, functions) => functions.eq(fields.salaryId, salary.id))
				.build(),
		);
		const scheduledDates = new Set(
			transactions.flatMap(transaction =>
				transaction.salaryOccurrenceDate
					? [format(new Date(transaction.salaryOccurrenceDate), "yyyy-MM-dd")]
					: [],
			),
		);
		const dates = salaryOccurrenceDates(
			salary.frequency as SalaryFrequency,
			salary.startDate,
			salary.payDay,
			salary.endDate,
			today,
			salary.dayOfWeek,
		).filter(date => date > format(salary.materializedThrough, "yyyy-MM-dd") && !scheduledDates.has(date));

		for (const date of dates) {
			const tagIds = (tagsBySalary.get(salary.id) ?? []).map(tag => tag.id);
			const inserted = await queryFirst(
				db.raw.sql`
					INSERT INTO "Transaction" (
						"amount",
						"categoryId",
						"date",
						"description",
						"destinationFinancialAccountId",
						"salaryId",
						"salaryOccurrenceDate",
							"time",
							"type",
							"userId"
					)
					VALUES (
						${param(numeric<12, 2>(salary.amount), { codecId: "pg/numeric@1" })},
						${param(tagIds[0] ?? null, { codecId: "sql/varchar@1" })},
						${param(new Date(date), { codecId: "pg/date@1" })},
						${param(salary.source, { codecId: "sql/varchar@1" })},
						${param(salary.financialAccountId, { codecId: "sql/varchar@1" })},
						${param(salary.id, { codecId: "sql/varchar@1" })},
						${param(new Date(date), { codecId: "pg/date@1" })},
						NULL,
							${param("INCOME", { codecId: "pg/text@1" })}::"TransactionType",
							${param(userId, { codecId: "sql/varchar@1" })}
					)
					ON CONFLICT ("salaryId", "salaryOccurrenceDate") DO NOTHING
					RETURNING "id"
				`
					.returnsRow({ id: db.sql.public.Transaction.columns.id })
					.build(),
			);
			if (!inserted) continue;
			await replaceEntityTags({
				entityIds: [inserted.id],
				entityType: tagEntityType.transaction,
				tagIds,
			});
		}
		await executeStatement(
			db.sql.public.Salary.update({ materializedThrough: today } as never)
				.where((fields, functions) => functions.eq(fields.id, salary.id))
				.build(),
		);
	}
}
