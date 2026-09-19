import { startOfDay, subDays } from "date-fns";
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
import { deleteLinkedSubscriptionPurchases } from "~/modules/subscriptions/application/delete-linked-subscription-purchases";
import { deleteLinkedTransactions } from "~/modules/transactions/application/delete-linked-transactions";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";

const subscriptionColumns = [
	"id",
	"userId",
	"name",
	"amount",
	"billingDay",
	"dayOfWeek",
	"frequency",
	"paymentMethod",
	"financialAccountId",
	"storeName",
	"startDate",
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

const PaymentMethod = t.Union([
	t.Literal("DEBIT"),
	t.Literal("CREDIT"),
	t.Literal("PIX"),
	t.Literal("CASH"),
	t.Literal("TRANSFER"),
	t.Literal("BOLETO"),
]);

export const SubscriptionsController = new Elysia({ prefix: "/subscriptions" })
	.get(
		"/",
		async ({ query, request }) => {
			const userId = await requireUserId(request);
			let queryBuilder = db.sql.public.Subscription.select(...subscriptionColumns).where(
				(fields, functions) => functions.eq(fields.userId, userId),
			);
			if (query.isActive !== undefined) {
				queryBuilder = queryBuilder.where((fields, functions) =>
					functions.eq(fields.isActive, query.isActive!),
				);
			}

			const subscriptions = await queryRows(queryBuilder.orderBy("name", { direction: "asc" }).build());
			const tagsBySubscription = await getTagsByEntity(
				tagEntityType.subscription,
				subscriptions.map(subscription => subscription.id),
			);

			// Calculate total monthly cost
			const totalMonthlyCost = subscriptions
				.filter(s => s.isActive)
				.reduce((sum, s) => {
					const amount = Number(s.amount);
					switch (s.frequency) {
						case "DAILY":
							return sum + amount * 30;
						case "WEEKLY":
							return sum + amount * 4;
						case "BIWEEKLY":
							return sum + amount * 2;
						case "MONTHLY":
							return sum + amount;
						case "YEARLY":
							return sum + amount / 12;
						default:
							return sum + amount;
					}
				}, 0);

			return {
				subscriptions: await Promise.all(
					subscriptions.map(async subscription => {
						const tags = tagsBySubscription.get(subscription.id) ?? [];
						return {
							...subscription,
							debtSplit: await getDebtSplitReturn(
								{ subscriptionId: subscription.id },
								Number(subscription.amount),
							),
							tagIds: tags.map(tag => tag.id),
							tags,
						};
					}),
				),
				totalMonthlyCost,
			};
		},
		{
			detail: { tags: ["Subscriptions"] },
			query: t.Object({
				isActive: t.Optional(t.Boolean()),
			}),
		},
	)
	.get(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Subscription", params.id, userId);
			const subscription = await queryFirst(
				db.sql.public.Subscription.select(...subscriptionColumns)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!subscription) {
				throw new HttpException("Subscription not found", 404);
			}

			const tagsBySubscription = await getTagsByEntity(tagEntityType.subscription, [subscription.id]);
			const tags = tagsBySubscription.get(subscription.id) ?? [];
			return {
				...subscription,
				debtSplit: await getDebtSplitReturn({ subscriptionId: subscription.id }, Number(subscription.amount)),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			detail: { tags: ["Subscriptions"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.get(
		"/:id/history",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Subscription", params.id, userId);
			const history = await queryRows(
				db.sql.public.SubscriptionHistory.select(
					"id",
					"subscriptionId",
					"field",
					"oldValue",
					"newValue",
					"changedAt",
				)
					.where((fields, functions) => functions.eq(fields.subscriptionId, params.id))
					.orderBy("changedAt", { direction: "desc" })
					.build(),
			);

			return history;
		},
		{
			detail: { tags: ["Subscriptions"] },
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
				await assertPaymentAccountOwnership(body.financialAccountId, body.paymentMethod ?? "CREDIT", userId);
			if (body.storeName) await resolveStore(userId, body.storeName);
			const tagIds = await assertTagOwnership(
				body.tagIds ?? (body.categoryId ? [body.categoryId] : []),
				userId,
			);
			const subscription = await queryFirst(
				db.sql.public.Subscription.insert([
					{
						amount: String(body.amount),
						billingDay: body.billingDay,
						dayOfWeek: body.dayOfWeek,
						endDate: body.endDate ? new Date(body.endDate) : undefined,
						financialAccountId: body.financialAccountId,
						frequency: body.frequency ?? "MONTHLY",
						isActive: body.isActive ?? true,
						name: body.name,
						paymentMethod: body.paymentMethod ?? "CREDIT",
						startDate: new Date(body.startDate),
						storeName: body.storeName,
						userId,
					},
				])
					.returning(...subscriptionColumns)
					.build(),
			);
			if (!subscription) throw new HttpException("Subscription not created", 500);
			if (body.debtSplit)
				await replaceDebtSplit({
					amount: body.amount,
					split: body.debtSplit,
					target: { subscriptionId: subscription.id },
					userId,
				});
			await replaceEntityTags({
				entityIds: [subscription.id],
				entityType: tagEntityType.subscription,
				tagIds,
			});
			const tagsBySubscription = await getTagsByEntity(tagEntityType.subscription, [subscription.id]);
			const tags = tagsBySubscription.get(subscription.id) ?? [];
			return {
				...subscription,
				debtSplit: await getDebtSplitReturn({ subscriptionId: subscription.id }, Number(subscription.amount)),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			body: t.Object({
				amount: t.Number(),
				billingDay: t.Number({ maximum: 31, minimum: 1 }),
				categoryId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				dayOfWeek: t.Optional(t.Nullable(t.Number({ maximum: 6, minimum: 0 }))),
				debtSplit: t.Optional(DebtSplitInputDTO),
				endDate: t.Optional(t.String()),
				financialAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
				frequency: t.Optional(RecurrenceFrequency),
				isActive: t.Optional(t.Boolean()),
				name: t.String({ maxLength: 100 }),
				paymentMethod: t.Optional(PaymentMethod),
				startDate: t.String(),
				storeName: t.Optional(t.String({ maxLength: 200 })),
				tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
			}),
			detail: { tags: ["Subscriptions"] },
		},
	)
	.patch(
		"/:id",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Subscription", params.id, userId);
			const tagIds =
				body.tagIds !== undefined || body.categoryId !== undefined
					? await assertTagOwnership(body.tagIds ?? (body.categoryId ? [body.categoryId] : []), userId)
					: undefined;
			const existing = await queryFirst(
				db.sql.public.Subscription.select(...subscriptionColumns)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Subscription not found", 404);
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
				subscriptionId: string;
				field: string;
				oldValue: string | null;
				newValue: string | null;
			}> = [];

			if (body.amount !== undefined && body.amount !== Number(existing.amount)) {
				historyEntries.push({
					field: "amount",
					newValue: String(body.amount),
					oldValue: String(existing.amount),
					subscriptionId: params.id,
				});
			}
			if (body.isActive !== undefined && body.isActive !== existing.isActive) {
				historyEntries.push({
					field: "isActive",
					newValue: String(body.isActive),
					oldValue: String(existing.isActive),
					subscriptionId: params.id,
				});
			}

			if (historyEntries.length > 0) {
				await executeStatement(db.sql.public.SubscriptionHistory.insert(historyEntries as never).build());
			}
			const subscription = await queryFirst(
				db.sql.public.Subscription.update({
					...(body.name && { name: body.name }),
					...(body.amount !== undefined && { amount: String(body.amount) }),
					...(body.billingDay !== undefined && { billingDay: body.billingDay }),
					...(body.dayOfWeek !== undefined && { dayOfWeek: body.dayOfWeek }),
					...(body.frequency && { frequency: body.frequency }),
					...(body.financialAccountId !== undefined && {
						financialAccountId: body.financialAccountId || null,
					}),
					...(body.paymentMethod && { paymentMethod: body.paymentMethod }),
					...(body.storeName !== undefined && { storeName: body.storeName }),
					...(body.endDate !== undefined && {
						endDate: body.endDate ? new Date(body.endDate) : null,
					}),
					...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
					...(body.isActive !== undefined && { isActive: body.isActive }),
					...(body.startDate === undefined && {
						materializedThrough: subDays(startOfDay(new Date()), 1),
					}),
					updatedAt: new Date(),
				} as never)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.returning(...subscriptionColumns)
					.build(),
			);
			if (!subscription) throw new HttpException("Subscription not found", 404);
			if (body.debtSplit !== undefined)
				await replaceDebtSplit({
					amount: Number(subscription.amount),
					split: body.debtSplit,
					target: { subscriptionId: subscription.id },
					userId,
				});
			if (tagIds !== undefined) {
				await replaceEntityTags({
					entityIds: [subscription.id],
					entityType: tagEntityType.subscription,
					tagIds,
				});
			}

			const tagsBySubscription = await getTagsByEntity(tagEntityType.subscription, [subscription.id]);
			const tags = tagsBySubscription.get(subscription.id) ?? [];
			return {
				...subscription,
				debtSplit: await getDebtSplitReturn({ subscriptionId: subscription.id }, Number(subscription.amount)),
				tagIds: tags.map(tag => tag.id),
				tags,
			};
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number()),
				billingDay: t.Optional(t.Number({ maximum: 31, minimum: 1 })),
				categoryId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
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
			detail: { tags: ["Subscriptions"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.delete(
		"/:id",
		async ({ params, query, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Subscription", params.id, userId);
			const existing = await queryFirst(
				db.sql.public.Subscription.select("id")
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Subscription not found", 404);
			}

			if (query.deleteTransactions) {
				await Promise.all([
					deleteLinkedTransactions("subscriptionId", params.id, userId),
					deleteLinkedSubscriptionPurchases(params.id, userId),
				]);
			}
			await replaceEntityTags({ entityIds: [params.id], entityType: tagEntityType.subscription, tagIds: [] });
			await executeStatement(
				db.sql.public.Subscription.delete()
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.build(),
			);
			return { success: true };
		},
		{
			detail: { tags: ["Subscriptions"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
			query: t.Object({ deleteTransactions: t.Optional(t.Boolean()) }),
		},
	);
