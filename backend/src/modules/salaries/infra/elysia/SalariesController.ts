import { startOfDay, subDays } from "date-fns";
import Elysia, { t } from "elysia";
import { assertCheckingOrCashAccountOwnership, assertDirectOwnership, requireUserId } from "~/modules/auth";
import {
	assertTagOwnership,
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { deleteLinkedTransactions } from "~/modules/transactions/application/delete-linked-transactions";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";

const salaryColumns = [
	"id",
	"userId",
	"financialAccountId",
	"source",
	"amount",
	"frequency",
	"payDay",
	"dayOfWeek",
	"startDate",
	"autoGenerateFrom",
	"endDate",
	"isActive",
	"createdAt",
	"updatedAt",
] as const;
const RecurrenceFrequency = t.Union([
	t.Literal("DAILY"),
	t.Literal("WEEKLY"),
	t.Literal("BIWEEKLY"),
	t.Literal("MONTHLY"),
	t.Literal("YEARLY"),
]);

export const SalariesController = new Elysia({ prefix: "/salaries" })
	.get(
		"/",
		async ({ query, request }) => {
			const userId = await requireUserId(request);
			let queryBuilder = db.sql.public.Salary.select(...salaryColumns).where((fields, functions) =>
				functions.eq(fields.userId, userId),
			);
			if (query.isActive !== undefined) {
				queryBuilder = queryBuilder.where((fields, functions) =>
					functions.eq(fields.isActive, query.isActive!),
				);
			}

			const salaries = await queryRows(queryBuilder.orderBy("startDate", { direction: "desc" }).build());
			const tagsBySalary = await getTagsByEntity(
				tagEntityType.salary,
				salaries.map(salary => salary.id),
			);
			return salaries.map(salary => {
				const tags = tagsBySalary.get(salary.id) ?? [];
				return { ...salary, tagIds: tags.map(tag => tag.id), tags };
			});
		},
		{
			detail: { tags: ["Salaries"] },
			query: t.Object({
				isActive: t.Optional(t.Boolean()),
			}),
		},
	)
	.get(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Salary", params.id, userId);
			const salary = await queryFirst(
				db.sql.public.Salary.select(...salaryColumns)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!salary) {
				throw new HttpException("Salary not found", 404);
			}

			const tagsBySalary = await getTagsByEntity(tagEntityType.salary, [salary.id]);
			const tags = tagsBySalary.get(salary.id) ?? [];
			return { ...salary, tagIds: tags.map(tag => tag.id), tags };
		},
		{
			detail: { tags: ["Salaries"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.get(
		"/:id/history",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Salary", params.id, userId);
			const history = await queryRows(
				db.sql.public.SalaryHistory.select("id", "salaryId", "field", "oldValue", "newValue", "changedAt")
					.where((fields, functions) => functions.eq(fields.salaryId, params.id))
					.orderBy("changedAt", { direction: "desc" })
					.build(),
			);

			return history;
		},
		{
			detail: { tags: ["Salaries"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			await assertCheckingOrCashAccountOwnership(body.financialAccountId, userId);
			const tagIds = await assertTagOwnership(
				body.tagIds ?? (body.categoryId ? [body.categoryId] : []),
				userId,
			);
			const salary = await queryFirst(
				db.sql.public.Salary.insert([
					{
						amount: String(body.amount),
						autoGenerateFrom: new Date(body.autoGenerateFrom ?? body.startDate),
						dayOfWeek: body.dayOfWeek,
						endDate: body.endDate ? new Date(body.endDate) : undefined,
						financialAccountId: body.financialAccountId,
						frequency: body.frequency ?? "MONTHLY",
						isActive: body.isActive ?? true,
						payDay: body.payDay,
						source: body.source,
						startDate: new Date(body.startDate),
						userId,
					},
				])
					.returning(...salaryColumns)
					.build(),
			);
			if (!salary) throw new HttpException("Salary not created", 500);
			await replaceEntityTags({ entityIds: [salary.id], entityType: tagEntityType.salary, tagIds });
			const tagsBySalary = await getTagsByEntity(tagEntityType.salary, [salary.id]);
			const tags = tagsBySalary.get(salary.id) ?? [];
			return { ...salary, tagIds: tags.map(tag => tag.id), tags };
		},
		{
			body: t.Object({
				amount: t.Number({ exclusiveMinimum: 0 }),
				autoGenerateFrom: t.Optional(t.String()),
				categoryId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				dayOfWeek: t.Optional(t.Nullable(t.Number({ maximum: 6, minimum: 0 }))),
				endDate: t.Optional(t.String()),
				financialAccountId: t.String({ maxLength: 36, minLength: 1 }),
				frequency: t.Optional(RecurrenceFrequency),
				isActive: t.Optional(t.Boolean()),
				payDay: t.Number({ maximum: 31, minimum: 1 }),
				source: t.String({ maxLength: 100 }),
				startDate: t.String(),
				tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
			}),
			detail: { tags: ["Salaries"] },
		},
	)
	.patch(
		"/:id",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Salary", params.id, userId);
			const tagIds =
				body.tagIds !== undefined || body.categoryId !== undefined
					? await assertTagOwnership(body.tagIds ?? (body.categoryId ? [body.categoryId] : []), userId)
					: undefined;
			if (body.financialAccountId)
				await assertCheckingOrCashAccountOwnership(body.financialAccountId, userId);
			const existing = await queryFirst(
				db.sql.public.Salary.select(...salaryColumns)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Salary not found", 404);
			}

			// Record history
			const historyEntries: Array<{
				salaryId: string;
				field: string;
				oldValue: string | null;
				newValue: string | null;
			}> = [];
			if (body.amount !== undefined && body.amount !== Number(existing.amount)) {
				historyEntries.push({
					field: "amount",
					newValue: String(body.amount),
					oldValue: String(existing.amount),
					salaryId: params.id,
				});
			}

			if (body.isActive !== undefined && body.isActive !== existing.isActive) {
				historyEntries.push({
					field: "isActive",
					newValue: String(body.isActive),
					oldValue: String(existing.isActive),
					salaryId: params.id,
				});
			}

			if (historyEntries.length > 0) {
				await executeStatement(db.sql.public.SalaryHistory.insert(historyEntries as never).build());
			}
			const salary = await queryFirst(
				db.sql.public.Salary.update({
					...(body.source && { source: body.source }),
					...(body.financialAccountId && { financialAccountId: body.financialAccountId }),
					...(body.amount !== undefined && { amount: String(body.amount) }),
					...(body.frequency && { frequency: body.frequency }),
					...(body.dayOfWeek !== undefined && { dayOfWeek: body.dayOfWeek }),
					...(body.payDay !== undefined && { payDay: body.payDay }),
					...(body.endDate !== undefined && {
						endDate: body.endDate ? new Date(body.endDate) : null,
					}),
					...(body.isActive !== undefined && { isActive: body.isActive }),
					materializedThrough: subDays(startOfDay(new Date()), 1),
					updatedAt: new Date(),
				} as never)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.returning(...salaryColumns)
					.build(),
			);
			if (!salary) throw new HttpException("Salary not found", 404);
			if (tagIds !== undefined) {
				await replaceEntityTags({ entityIds: [salary.id], entityType: tagEntityType.salary, tagIds });
			}

			const tagsBySalary = await getTagsByEntity(tagEntityType.salary, [salary.id]);
			const tags = tagsBySalary.get(salary.id) ?? [];
			return { ...salary, tagIds: tags.map(tag => tag.id), tags };
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
				categoryId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				dayOfWeek: t.Optional(t.Nullable(t.Number({ maximum: 6, minimum: 0 }))),
				endDate: t.Optional(t.Nullable(t.String())),
				financialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				frequency: t.Optional(RecurrenceFrequency),
				isActive: t.Optional(t.Boolean()),
				payDay: t.Optional(t.Number({ maximum: 31, minimum: 1 })),
				source: t.Optional(t.String({ maxLength: 100 })),
				tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
			}),
			detail: { tags: ["Salaries"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.delete(
		"/:id",
		async ({ params, query, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Salary", params.id, userId);
			const existing = await queryFirst(
				db.sql.public.Salary.select("id")
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Salary not found", 404);
			}

			if (query.deleteTransactions) await deleteLinkedTransactions("salaryId", params.id, userId);
			await replaceEntityTags({ entityIds: [params.id], entityType: tagEntityType.salary, tagIds: [] });
			await executeStatement(
				db.sql.public.Salary.delete()
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.build(),
			);
			return { success: true };
		},
		{
			detail: { tags: ["Salaries"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
			query: t.Object({ deleteTransactions: t.Optional(t.Boolean()) }),
		},
	);
