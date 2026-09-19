import Elysia, { t } from "elysia";
import { assertDirectOwnership, assertPaymentAccountOwnership, requireUserId } from "~/modules/auth";
import {
	assertTagOwnership,
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { getDebtSplitReturn, replaceDebtSplit } from "~/modules/debts/application";
import { DebtSplitInputDTO } from "~/modules/debts/infra/elysia/DebtSplitsDTO";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { deleteLinkedTransactions } from "~/modules/transactions/application/delete-linked-transactions";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";

const recurringColumns = [
	"id",
	"userId",
	"name",
	"amount",
	"frequency",
	"dayOfMonth",
	"dayOfWeek",
	"startDate",
	"endDate",
	"categoryId",
	"financialAccountId",
	"storeName",
	"paymentMethod",
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

const PaymentMethod = t.Union([
	t.Literal("DEBIT"),
	t.Literal("CREDIT"),
	t.Literal("PIX"),
	t.Literal("CASH"),
	t.Literal("TRANSFER"),
	t.Literal("BOLETO"),
]);

export const RecurringController = new Elysia({ prefix: "/recurring" })
	.get(
		"/",
		async ({ query, request }) => {
			const userId = await requireUserId(request);
			let queryBuilder = db.sql.public.RecurringPayment.select(...recurringColumns).where(
				(fields, functions) => functions.eq(fields.userId, userId),
			);
			if (query.isActive !== undefined) {
				queryBuilder = queryBuilder.where((fields, functions) =>
					functions.eq(fields.isActive, query.isActive!),
				);
			}

			const payments = await queryRows(queryBuilder.orderBy("name", { direction: "asc" }).build());
			const tagsByPayment = await getTagsByEntity(
				tagEntityType.recurringPayment,
				payments.map(payment => payment.id),
			);
			return Promise.all(
				payments.map(async payment => {
					const tags = tagsByPayment.get(payment.id) ?? [];
					return {
						...payment,
						debtSplit: await getDebtSplitReturn({ recurringPaymentId: payment.id }, Number(payment.amount)),
						tagIds: tags.map(tag => tag.id),
						tags,
					};
				}),
			);
		},
		{
			detail: { tags: ["Recurring Payments"] },
			query: t.Object({
				isActive: t.Optional(t.Boolean()),
			}),
		},
	)
	.get(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("RecurringPayment", params.id, userId);
			const payment = await queryFirst(
				db.sql.public.RecurringPayment.select(...recurringColumns)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!payment) {
				throw new HttpException("Recurring payment not found", 404);
			}

			const tagsByPayment = await getTagsByEntity(tagEntityType.recurringPayment, [payment.id]);
			const tags = tagsByPayment.get(payment.id) ?? [];
			return {
				...payment,
				debtSplit: await getDebtSplitReturn({ recurringPaymentId: payment.id }, Number(payment.amount)),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			detail: { tags: ["Recurring Payments"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.get(
		"/:id/history",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("RecurringPayment", params.id, userId);
			const history = await queryRows(
				db.sql.public.RecurringPaymentHistory.select(
					"id",
					"recurringPaymentId",
					"field",
					"oldValue",
					"newValue",
					"changedAt",
				)
					.where((fields, functions) => functions.eq(fields.recurringPaymentId, params.id))
					.orderBy("changedAt", { direction: "desc" })
					.build(),
			);

			return history;
		},
		{
			detail: { tags: ["Recurring Payments"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			if (body.financialAccountId)
				await assertPaymentAccountOwnership(body.financialAccountId, body.paymentMethod ?? "DEBIT", userId);
			if (body.storeName) await resolveStore(userId, body.storeName);
			const tagIds = await assertTagOwnership(
				body.tagIds ?? (body.categoryId ? [body.categoryId] : []),
				userId,
			);
			const payment = await queryFirst(
				db.sql.public.RecurringPayment.insert([
					{
						amount: String(body.amount),
						categoryId: tagIds[0],
						dayOfMonth: body.dayOfMonth,
						dayOfWeek: body.dayOfWeek,
						endDate: body.endDate ? new Date(body.endDate) : undefined,
						financialAccountId: body.financialAccountId,
						frequency: body.frequency,
						isActive: body.isActive ?? true,
						name: body.name,
						paymentMethod: body.paymentMethod ?? "DEBIT",
						startDate: new Date(body.startDate),
						storeName: body.storeName,
						userId,
					},
				])
					.returning(...recurringColumns)
					.build(),
			);
			if (!payment) throw new HttpException("Recurring payment not created", 500);
			if (body.debtSplit)
				await replaceDebtSplit({
					amount: body.amount,
					split: body.debtSplit,
					target: { recurringPaymentId: payment.id },
					userId,
				});
			await replaceEntityTags({
				entityIds: [payment.id],
				entityType: tagEntityType.recurringPayment,
				tagIds,
			});

			const tagsByPayment = await getTagsByEntity(tagEntityType.recurringPayment, [payment.id]);
			const tags = tagsByPayment.get(payment.id) ?? [];
			return {
				...payment,
				debtSplit: await getDebtSplitReturn({ recurringPaymentId: payment.id }, Number(payment.amount)),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			body: t.Object({
				amount: t.Number(),
				categoryId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				dayOfMonth: t.Optional(t.Number({ maximum: 31, minimum: 1 })),
				dayOfWeek: t.Optional(t.Number({ maximum: 6, minimum: 0 })),
				debtSplit: t.Optional(DebtSplitInputDTO),
				endDate: t.Optional(t.String()),
				financialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				frequency: RecurrenceFrequency,
				isActive: t.Optional(t.Boolean()),
				name: t.String({ maxLength: 100 }),
				paymentMethod: t.Optional(PaymentMethod),
				startDate: t.String(),
				storeName: t.Optional(t.String({ maxLength: 200 })),
				tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
			}),
			detail: { tags: ["Recurring Payments"] },
		},
	)
	.patch(
		"/:id",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("RecurringPayment", params.id, userId);
			const tagIds =
				body.tagIds !== undefined || body.categoryId !== undefined
					? await assertTagOwnership(body.tagIds ?? (body.categoryId ? [body.categoryId] : []), userId)
					: undefined;
			const existing = await queryFirst(
				db.sql.public.RecurringPayment.select(...recurringColumns)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Recurring payment not found", 404);
			}
			if (body.financialAccountId)
				await assertPaymentAccountOwnership(
					body.financialAccountId,
					(body.paymentMethod ?? existing.paymentMethod) as typeof PaymentMethod.static,
					userId,
				);
			if (body.storeName) await resolveStore(userId, body.storeName);

			// Record history
			const historyEntries: Array<{
				recurringPaymentId: string;
				field: string;
				oldValue: string | null;
				newValue: string | null;
			}> = [];

			if (body.amount !== undefined && body.amount !== Number(existing.amount)) {
				historyEntries.push({
					field: "amount",
					newValue: String(body.amount),
					oldValue: String(existing.amount),
					recurringPaymentId: params.id,
				});
			}
			if (body.isActive !== undefined && body.isActive !== existing.isActive) {
				historyEntries.push({
					field: "isActive",
					newValue: String(body.isActive),
					oldValue: String(existing.isActive),
					recurringPaymentId: params.id,
				});
			}

			if (historyEntries.length > 0) {
				await executeStatement(db.sql.public.RecurringPaymentHistory.insert(historyEntries as never).build());
			}

			const payment = await queryFirst(
				db.sql.public.RecurringPayment.update({
					...(body.name && { name: body.name }),
					...(body.amount !== undefined && { amount: String(body.amount) }),
					...(body.frequency && { frequency: body.frequency }),
					...(body.dayOfMonth !== undefined && { dayOfMonth: body.dayOfMonth }),
					...(body.dayOfWeek !== undefined && { dayOfWeek: body.dayOfWeek }),
					...(body.endDate !== undefined && {
						endDate: body.endDate ? new Date(body.endDate) : null,
					}),
					...(tagIds !== undefined && { categoryId: tagIds[0] ?? null }),
					...(body.financialAccountId !== undefined && {
						financialAccountId: body.financialAccountId || null,
					}),
					...(body.paymentMethod && { paymentMethod: body.paymentMethod }),
					...(body.storeName !== undefined && { storeName: body.storeName }),
					...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
					...(body.isActive !== undefined && { isActive: body.isActive }),
					updatedAt: new Date(),
				} as never)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.returning(...recurringColumns)
					.build(),
			);
			if (!payment) throw new HttpException("Recurring payment not found", 404);
			if (body.debtSplit !== undefined)
				await replaceDebtSplit({
					amount: Number(payment.amount),
					split: body.debtSplit,
					target: { recurringPaymentId: payment.id },
					userId,
				});
			if (tagIds !== undefined) {
				await replaceEntityTags({
					entityIds: [payment.id],
					entityType: tagEntityType.recurringPayment,
					tagIds,
				});
			}

			const tagsByPayment = await getTagsByEntity(tagEntityType.recurringPayment, [payment.id]);
			const tags = tagsByPayment.get(payment.id) ?? [];
			return {
				...payment,
				debtSplit: await getDebtSplitReturn({ recurringPaymentId: payment.id }, Number(payment.amount)),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number()),
				categoryId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				dayOfMonth: t.Optional(t.Nullable(t.Number({ maximum: 31, minimum: 1 }))),
				dayOfWeek: t.Optional(t.Nullable(t.Number({ maximum: 6, minimum: 0 }))),
				debtSplit: t.Optional(t.Nullable(DebtSplitInputDTO)),
				endDate: t.Optional(t.Nullable(t.String())),
				financialAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
				frequency: t.Optional(RecurrenceFrequency),
				isActive: t.Optional(t.Boolean()),
				name: t.Optional(t.String({ maxLength: 100 })),
				paymentMethod: t.Optional(PaymentMethod),
				startDate: t.Optional(t.String()),
				storeName: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
				tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
			}),
			detail: { tags: ["Recurring Payments"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.delete(
		"/:id",
		async ({ params, query, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("RecurringPayment", params.id, userId);
			const existing = await queryFirst(
				db.sql.public.RecurringPayment.select("id")
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Recurring payment not found", 404);
			}

			if (query.deleteTransactions) await deleteLinkedTransactions("recurrenceId", params.id, userId);
			await replaceEntityTags({
				entityIds: [params.id],
				entityType: tagEntityType.recurringPayment,
				tagIds: [],
			});
			await executeStatement(
				db.sql.public.RecurringPayment.delete()
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.build(),
			);
			return { success: true };
		},
		{
			detail: { tags: ["Recurring Payments"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
			query: t.Object({ deleteTransactions: t.Optional(t.Boolean()) }),
		},
	);
