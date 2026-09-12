import Elysia, { t } from "elysia";
import { assertCreditCardOwnership, requireUserId } from "~/modules/auth";
import {
	assertTagOwnership,
	getTagsByEntity,
	replaceEntityTags,
} from "~/modules/categories/application/tag-assignments";
import { linkPurchaseToDebt, syncPurchaseDebtEvent } from "~/modules/debts/application/debt-ledger";
import {
	getDebtSplitInput,
	getDebtSplitReturn,
	replaceDebtSplit,
} from "~/modules/debts/application/debt-splits";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";
import { materializeImportedPurchase } from "../../application/materialize-imported-purchase";
import { assignCreditCardPurchaseExternalIds } from "../../domain/credit-card-import-identity";
import { matchesExistingCreditPurchase } from "../../domain/credit-card-import-reconciliation";
import { parseCreditCardStatementPdf } from "../../domain/credit-card-statement-parser";
import { CreditCardImportItemReconcileDTO, CreditCardImportItemUpdateDTO } from "./CreditCardImportsDTO";

const importItemTagEntityType = "CREDIT_CARD_IMPORT_ITEM";
const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

async function getPotentialDuplicates(
	creditCardId: string,
	items: Array<{
		description: string;
		id: string;
		installmentAmount: number | string;
		installments: number;
		purchaseDate: Date | string;
		reconciledCreditPurchaseId: null | string;
		storeName: null | string;
	}>,
) {
	const candidates = await queryRows(
		db.sql.public.CreditPurchase.innerJoin(db.sql.public.CreditCardStatement, (fields, functions) =>
			functions.eq(fields.CreditPurchase.statementId, fields.CreditCardStatement.id),
		)
			.select(fields => ({
				currentInstallment: fields.CreditPurchase.currentInstallment,
				description: fields.CreditPurchase.description,
				id: fields.CreditPurchase.id,
				installmentAmount: fields.CreditPurchase.installmentAmount,
				installments: fields.CreditPurchase.installments,
				parentId: fields.CreditPurchase.parentId,
				purchaseDate: fields.CreditPurchase.purchaseDate,
				storeName: fields.CreditPurchase.storeName,
				time: fields.CreditPurchase.time,
				totalAmount: fields.CreditPurchase.totalAmount,
			}))
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.CreditCardStatement.creditCardId, creditCardId),
					functions.eq(fields.CreditPurchase.parentId, null),
					functions.eq(fields.CreditPurchase.externalId, null),
					functions.eq(fields.CreditPurchase.isRefund, false),
				),
			)
			.build(),
	);
	const children = candidates.length
		? await queryRows(
				db.sql.public.CreditPurchase.select("parentId")
					.where((fields, functions) =>
						functions.in(
							fields.parentId,
							candidates.map(candidate => candidate.id),
						),
					)
					.build(),
			)
		: [];
	const reconciledItems = await queryRows(
		db.sql.public.CreditCardImportItem.select("reconciledCreditPurchaseId").build(),
	);
	const occupiedCandidateIds = new Set(
		reconciledItems.flatMap(item =>
			item.reconciledCreditPurchaseId ? [item.reconciledCreditPurchaseId] : [],
		),
	);
	const childCounts = new Map<string, number>();
	for (const child of children) {
		if (child.parentId) childCounts.set(child.parentId, (childCounts.get(child.parentId) ?? 0) + 1);
	}
	const candidatesWithCounts = candidates
		.filter(candidate => !occupiedCandidateIds.has(candidate.id))
		.map(candidate => ({
			...candidate,
			existingInstallments: 1 + (childCounts.get(candidate.id) ?? 0),
		}));
	const result = new Map<string, typeof candidatesWithCounts>();
	for (const item of items) {
		if (item.reconciledCreditPurchaseId) continue;
		const matches = candidatesWithCounts.filter(candidate => matchesExistingCreditPurchase(item, candidate));
		if (matches.length) result.set(item.id, matches);
	}
	return result;
}

async function getImport(userId: string, importId: string) {
	const creditCardImport = await queryFirst(
		db.sql.public.CreditCardImport.select(
			"id",
			"creditCardId",
			"provider",
			"status",
			"fileName",
			"statementDate",
			"dueDate",
			"createdAt",
			"updatedAt",
		)
			.where((fields, functions) =>
				functions.and(functions.eq(fields.id, importId), functions.eq(fields.userId, userId)),
			)
			.limit(1)
			.build(),
	);
	if (!creditCardImport) throw new HttpException("Importação de fatura não encontrada", 404);
	return creditCardImport;
}

async function getImportReturn(userId: string, importId: string) {
	const creditCardImport = await getImport(userId, importId);
	const items = await queryRows(
		db.sql.public.CreditCardImportItem.select(
			"id",
			"categoryId",
			"createdAt",
			"currentInstallment",
			"description",
			"externalId",
			"installmentAmount",
			"installments",
			"isSelected",
			"purchaseDate",
			"reconciledCreditPurchaseId",
			"storeName",
			"time",
			"totalAmount",
			"updatedAt",
		)
			.where((fields, functions) => functions.eq(fields.creditCardImportId, importId))
			.orderBy("purchaseDate", { direction: "desc" })
			.build(),
	);
	const tags = await getTagsByEntity(
		importItemTagEntityType,
		items.map(item => item.id),
	);
	const duplicates = await getPotentialDuplicates(creditCardImport.creditCardId, items);
	return {
		...creditCardImport,
		dueDate: dateKey(creditCardImport.dueDate),
		items: await Promise.all(
			items.map(async item => ({
				...item,
				debtSplit: await getDebtSplitReturn({ creditCardImportItemId: item.id }, Number(item.totalAmount)),
				duplicates: (duplicates.get(item.id) ?? []).map(candidate => ({
					...candidate,
					installmentAmount: Number(candidate.installmentAmount),
					purchaseDate: dateKey(candidate.purchaseDate),
					totalAmount: Number(candidate.totalAmount),
				})),
				installmentAmount: Number(item.installmentAmount),
				purchaseDate: dateKey(item.purchaseDate),
				tagIds: (tags.get(item.id) ?? []).map(tag => tag.id),
				tags: tags.get(item.id) ?? [],
				totalAmount: Number(item.totalAmount),
			})),
		),
		statementDate: dateKey(creditCardImport.statementDate),
	};
}

async function cleanupItemTags(itemIds: string[]) {
	if (!itemIds.length) return;
	await executeStatement(
		db.sql.public.TagAssignment.delete()
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.entityType, importItemTagEntityType),
					functions.in(fields.entityId, itemIds),
				),
			)
			.build(),
	);
}

async function approveItems(userId: string, importId: string, itemId?: string) {
	const creditCardImport = await getImport(userId, importId);
	if (creditCardImport.status !== "PENDING") throw new HttpException("Esta importação já foi aprovada", 400);
	const card = await queryFirst(
		db.sql.public.CreditCard.select(
			"id",
			"dueDay",
			"statementDay",
			"cashbackAccountId",
			"cashbackRate",
			"cashbackYieldPeriod",
			"cashbackYieldReferencePercentage",
			"cashbackYieldReferenceRate",
		)
			.where((fields, functions) => functions.eq(fields.id, creditCardImport.creditCardId))
			.limit(1)
			.build(),
	);
	if (!card) throw new HttpException("Cartão não encontrado", 404);
	const allItems = await queryRows(
		db.sql.public.CreditCardImportItem.select(
			"id",
			"categoryId",
			"description",
			"externalId",
			"installmentAmount",
			"installments",
			"purchaseDate",
			"reconciledCreditPurchaseId",
			"storeName",
			"time",
			"totalAmount",
		)
			.where((fields, functions) => functions.eq(fields.creditCardImportId, importId))
			.build(),
	);
	const duplicates = await getPotentialDuplicates(creditCardImport.creditCardId, allItems);
	const selectedItems = allItems.filter(item => (itemId ? item.id === itemId : !duplicates.has(item.id)));
	if (itemId && !selectedItems.length) throw new HttpException("Compra importada não encontrada", 404);
	if (itemId && duplicates.has(itemId))
		throw new HttpException("Concilie as possíveis parcelas existentes antes de aprovar", 400);
	const tagsByItem = await getTagsByEntity(
		importItemTagEntityType,
		selectedItems.map(item => item.id),
	);
	for (const item of selectedItems) {
		if (item.storeName) await resolveStore(userId, item.storeName);
		const debtSplit = await getDebtSplitInput({ creditCardImportItemId: item.id });
		const rootId = await materializeImportedPurchase(
			{
				...card,
				cashbackRate: card.cashbackRate === null ? null : Number(card.cashbackRate),
				cashbackYieldPeriod: card.cashbackYieldPeriod as "MONTHLY" | "YEARLY" | null,
				cashbackYieldReferencePercentage:
					card.cashbackYieldReferencePercentage === null
						? null
						: Number(card.cashbackYieldReferencePercentage),
				cashbackYieldReferenceRate:
					card.cashbackYieldReferenceRate === null ? null : Number(card.cashbackYieldReferenceRate),
			},
			{
				...item,
				existingRootId: item.reconciledCreditPurchaseId,
				installmentAmount: Number(item.installmentAmount),
				tagIds: (tagsByItem.get(item.id) ?? []).map(tag => tag.id),
				totalAmount: Number(item.totalAmount),
			},
		);
		if (!rootId) throw new HttpException("Não foi possível identificar a compra criada", 500);
		const debtInput = {
			creditPurchaseId: rootId,
			date: dateKey(item.purchaseDate),
			debtSplit: debtSplit ?? null,
			description: item.storeName || item.description,
			totalAmount: Number(item.totalAmount),
			userId,
		};
		if (item.reconciledCreditPurchaseId) await syncPurchaseDebtEvent(debtInput);
		else if (debtSplit) await linkPurchaseToDebt({ ...debtInput, debtSplit });
	}
	await cleanupItemTags(selectedItems.map(item => item.id));
	if (selectedItems.length) {
		await executeStatement(
			db.sql.public.CreditCardImportItem.delete()
				.where((fields, functions) =>
					functions.in(
						fields.id,
						selectedItems.map(item => item.id),
					),
				)
				.build(),
		);
	}
	const remaining = await queryFirst(
		db.sql.public.CreditCardImportItem.select("id")
			.where((fields, functions) => functions.eq(fields.creditCardImportId, importId))
			.limit(1)
			.build(),
	);
	if (!remaining)
		await executeStatement(
			db.sql.public.CreditCardImport.update({ status: "APPROVED", updatedAt: new Date() })
				.where((fields, functions) => functions.eq(fields.id, importId))
				.build(),
		);
	return { created: selectedItems.length };
}

export const CreditCardImportsController = new Elysia({ prefix: "/credit-card-imports" })
	.get("/", async ({ request }) => {
		const userId = await requireUserId(request);
		const imports = await queryRows(
			db.sql.public.CreditCardImport.select("id")
				.where((fields, functions) =>
					functions.and(functions.eq(fields.userId, userId), functions.eq(fields.status, "PENDING")),
				)
				.orderBy("createdAt", { direction: "desc" })
				.build(),
		);
		return Promise.all(imports.map(item => getImportReturn(userId, item.id)));
	})
	.get("/:id", async ({ params, request }) => getImportReturn(await requireUserId(request), params.id), {
		params: t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) }),
	})
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			await assertCreditCardOwnership(body.creditCardId, userId);
			if (body.file.type !== "application/pdf" && !body.file.name.toLowerCase().endsWith(".pdf"))
				throw new HttpException("Envie um arquivo PDF", 400);
			const fileBytes = new Uint8Array(await body.file.arrayBuffer());
			if (fileBytes.length < 5 || new TextDecoder().decode(fileBytes.slice(0, 5)) !== "%PDF-")
				throw new HttpException("Envie um PDF válido", 400);
			const statement = await parseCreditCardStatementPdf(fileBytes.buffer, body.provider);
			const purchases = assignCreditCardPurchaseExternalIds(statement.purchases, body.creditCardId);
			const [existing, pending] = await Promise.all([
				queryRows(
					db.sql.public.CreditPurchase.innerJoin(db.sql.public.CreditCardStatement, (fields, functions) =>
						functions.eq(fields.CreditPurchase.statementId, fields.CreditCardStatement.id),
					)
						.select(fields => ({ externalId: fields.CreditPurchase.externalId }))
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.CreditCardStatement.creditCardId, body.creditCardId),
								functions.in(
									fields.CreditPurchase.externalId,
									purchases.map(purchase => purchase.externalId),
								),
							),
						)
						.build(),
				),
				queryRows(
					db.sql.public.CreditCardImportItem.innerJoin(db.sql.public.CreditCardImport, (fields, functions) =>
						functions.eq(fields.CreditCardImportItem.creditCardImportId, fields.CreditCardImport.id),
					)
						.select(fields => ({ externalId: fields.CreditCardImportItem.externalId }))
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.CreditCardImport.creditCardId, body.creditCardId),
								functions.eq(fields.CreditCardImport.status, "PENDING"),
								functions.in(
									fields.CreditCardImportItem.externalId,
									purchases.map(purchase => purchase.externalId),
								),
							),
						)
						.build(),
				),
			]);
			const existingIds = new Set(
				[...existing, ...pending].flatMap(item => (item.externalId ? [item.externalId] : [])),
			);
			const newPurchases = purchases.filter(purchase => !existingIds.has(purchase.externalId));
			const ignoredCount = purchases.length - newPurchases.length;
			if (!newPurchases.length) return { creditCardImport: null, ignoredCount };
			const creditCardImport = await queryFirst(
				db.sql.public.CreditCardImport.insert([
					{
						creditCardId: body.creditCardId,
						dueDate: new Date(`${statement.dueDate}T12:00:00`),
						fileName: body.file.name.slice(0, 255),
						provider: statement.provider,
						statementDate: new Date(`${statement.statementDate}T12:00:00`),
						userId,
					},
				])
					.returning("id")
					.build(),
			);
			if (!creditCardImport) throw new HttpException("Não foi possível criar a importação", 500);
			await executeStatement(
				db.sql.public.CreditCardImportItem.insert(
					newPurchases.map(purchase => ({
						...purchase,
						creditCardImportId: creditCardImport.id,
						installmentAmount: String(purchase.installmentAmount),
						purchaseDate: new Date(`${purchase.purchaseDate}T12:00:00`),
						totalAmount: String(purchase.totalAmount),
					})),
				).build(),
			);
			return { creditCardImport: await getImportReturn(userId, creditCardImport.id), ignoredCount };
		},
		{
			body: t.Object({
				creditCardId: t.String({ maxLength: 36, minLength: 1 }),
				file: t.File(),
				provider: t.Literal("MERCADO_PAGO"),
			}),
		},
	)
	.patch(
		"/:id/items/:itemId",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const creditCardImport = await getImport(userId, params.id);
			if (creditCardImport.status !== "PENDING")
				throw new HttpException("Esta importação já foi aprovada", 400);
			const current = await queryFirst(
				db.sql.public.CreditCardImportItem.select(
					"id",
					"description",
					"installments",
					"isSelected",
					"purchaseDate",
					"storeName",
					"totalAmount",
				)
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.id, params.itemId),
							functions.eq(fields.creditCardImportId, params.id),
						),
					)
					.limit(1)
					.build(),
			);
			if (!current) throw new HttpException("Compra importada não encontrada", 404);
			const installments = body.installments ?? current.installments;
			const totalAmount = body.totalAmount ?? Number(current.totalAmount);
			const tagIds = body.tagIds === undefined ? undefined : await assertTagOwnership(body.tagIds, userId);
			await executeStatement(
				db.sql.public.CreditCardImportItem.update({
					description: body.description?.trim() || current.description,
					installmentAmount: String(Math.round((totalAmount / installments) * 100) / 100),
					installments,
					isSelected: body.isSelected ?? current.isSelected,
					purchaseDate: body.purchaseDate ? new Date(`${body.purchaseDate}T12:00:00`) : current.purchaseDate,
					storeName: body.storeName === undefined ? current.storeName : body.storeName?.trim() || null,
					...(body.time !== undefined && { time: body.time }),
					totalAmount: String(totalAmount),
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, current.id))
					.build(),
			);
			if (tagIds)
				await replaceEntityTags({ entityIds: [current.id], entityType: importItemTagEntityType, tagIds });
			if (body.debtSplit !== undefined)
				await replaceDebtSplit({
					amount: totalAmount,
					split: body.debtSplit,
					target: { creditCardImportItemId: current.id },
					userId,
				});
			return getImportReturn(userId, params.id);
		},
		{ body: CreditCardImportItemUpdateDTO, params: t.Object({ id: t.String(), itemId: t.String() }) },
	)
	.post(
		"/:id/items/:itemId/reconcile",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const creditCardImport = await getImport(userId, params.id);
			if (creditCardImport.status !== "PENDING")
				throw new HttpException("Esta importação já foi aprovada", 400);
			const item = await queryFirst(
				db.sql.public.CreditCardImportItem.select(
					"id",
					"description",
					"installmentAmount",
					"installments",
					"purchaseDate",
					"reconciledCreditPurchaseId",
					"storeName",
				)
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.id, params.itemId),
							functions.eq(fields.creditCardImportId, params.id),
						),
					)
					.limit(1)
					.build(),
			);
			if (!item) throw new HttpException("Compra importada não encontrada", 404);
			if (body.creditPurchaseId === null) {
				await executeStatement(
					db.sql.public.CreditCardImportItem.update({
						reconciledCreditPurchaseId: null,
						updatedAt: new Date(),
					})
						.where((fields, functions) => functions.eq(fields.id, item.id))
						.build(),
				);
				return getImportReturn(userId, params.id);
			}
			const candidates = await getPotentialDuplicates(creditCardImport.creditCardId, [
				{ ...item, reconciledCreditPurchaseId: null },
			]);
			if (!(candidates.get(item.id) ?? []).some(candidate => candidate.id === body.creditPurchaseId))
				throw new HttpException("A compra selecionada não corresponde às parcelas importadas", 409);
			await executeStatement(
				db.sql.public.CreditCardImportItem.update({
					reconciledCreditPurchaseId: body.creditPurchaseId,
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, item.id))
					.build(),
			);
			return getImportReturn(userId, params.id);
		},
		{
			body: CreditCardImportItemReconcileDTO,
			params: t.Object({ id: t.String(), itemId: t.String() }),
		},
	)
	.post("/:id/items/:itemId/approve", async ({ params, request }) =>
		approveItems(await requireUserId(request), params.id, params.itemId),
	)
	.post("/:id/approve", async ({ params, request }) => approveItems(await requireUserId(request), params.id))
	.delete("/:id", async ({ params, request }) => {
		const userId = await requireUserId(request);
		const creditCardImport = await getImport(userId, params.id);
		if (creditCardImport.status !== "PENDING") throw new HttpException("Importação já finalizada", 400);
		const items = await queryRows(
			db.sql.public.CreditCardImportItem.select("id")
				.where((fields, functions) => functions.eq(fields.creditCardImportId, creditCardImport.id))
				.build(),
		);
		await cleanupItemTags(items.map(item => item.id));
		await executeStatement(
			db.sql.public.CreditCardImport.delete()
				.where((fields, functions) => functions.eq(fields.id, creditCardImport.id))
				.build(),
		);
		return { success: true };
	});
