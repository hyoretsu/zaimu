import { creditBookEntries } from "@zaimu/finance/credit-book";
import { importedAnticipation, withImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import Elysia, { t } from "elysia";
import { assertCreditCardOwnership, requireUserId } from "~/modules/auth";
import {
	assertTagOwnership,
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { readCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { getDebtSplitInput, replaceDebtSplit } from "~/modules/debts/application/debt-splits";
import { ApproveImportItemBody } from "~/modules/recurring/infra/elysia/RecurrenceDTO";
import { enqueueImportBatch, getImportBatch } from "~/modules/transaction-imports/application/jobs";
import {
	BatchUploadAccepted,
	BatchUploadReturn,
} from "~/modules/transaction-imports/infra/elysia/BatchUploadDTO";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { rejectLegacyFinancialFields } from "~/shared/infra/elysia/strict-json-body";
import { db, executeStatement, queryFirst, queryRaw, queryRows } from "~/shared/infra/sql";
import { approveWithRecurrence } from "../../application/approve-with-recurrence";
import { associateImportedTax } from "../../application/associate-import-tax";
import {
	approveItems,
	cleanupItemTags,
	combinePendingAnticipationRefunds,
	getImport,
	getImportReturn,
	getPotentialDuplicates,
} from "../../application/import-service";
import { approveReviewedRefund, saveRefundReview } from "../../application/refund-review";
import { CreateCreditCardImportBody, createUploadedCreditCardImport } from "../../application/upload";
import { getEditedInstallmentAmount } from "../../domain/edited-installment-amount";
import { existingImportedRefund } from "../../domain/existing-imported-refund";
import {
	getFinancingSource,
	getFinancingTarget,
	preserveFinancedOperation,
	withFinancingSource,
	withFinancingTarget,
} from "../../domain/financing-source-reference";
import { readImportTaxes } from "../../domain/import-purchase-taxes";
import {
	pendingPurchaseId,
	withoutPendingPurchase,
	withPendingPurchase,
} from "../../domain/pending-purchase-reference";
import {
	CreditCardImportItemReconcileDTO,
	CreditCardImportItemUpdateDTO,
	RefundImportReviewDTO,
	SavedRefundImportReviewReturn,
} from "./CreditCardImportsDTO";

const importItemTagEntityType = "CREDIT_CARD_IMPORT_ITEM";
const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

const { file: _fileSchema, ...batchUploadProperties } = CreateCreditCardImportBody.properties;

export const CreditCardImportsController = new Elysia({ prefix: "/credit-card-imports" })
	.onTransform(({ body }) => {
		rejectLegacyFinancialFields(body);
	})
	.get(
		"/",
		async ({ request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"imports:pending",
				{ domain: "credit-card-imports" },
				() =>
					queryRaw<
						{ id: string; fileName: string; pendingItemCount: number } & Record<string, unknown>
					>(
						`SELECT import."id", import."fileName", count(item."id")::integer AS "pendingItemCount"
			 FROM "CreditCardImport" import
			 LEFT JOIN "CreditCardImportItem" item ON item."creditCardImportId" = import."id"
			 WHERE import."userId" = $1 AND import."status" = 'PENDING'
			 GROUP BY import."id", import."fileName", import."createdAt"
			 ORDER BY "pendingItemCount" ASC, import."createdAt" DESC`,
						[userId],
					),
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return null;
			}
			return cached.value;
		},
		{ detail: { operationId: "getCreditCardImports" } },
	)
	.get(
		"/:id",
		async ({ params, query, request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				`imports:detail:${params.id}`,
				{ domain: "credit-card-imports", ...query },
				() => getImportReturn(userId, params.id, query),
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return null;
			}
			return cached.value;
		},
		{
			detail: { operationId: "getCreditCardImportsById" },
			params: t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) }),
			query: t.Object({
				cursor: t.Optional(t.String({ maxLength: 2048, minLength: 1 })),
				limit: t.Optional(t.Number({ maximum: 100, minimum: 1 })),
			}),
		},
	)
	.get(
		"/batch/:batchId",
		async ({ params, request }) => getImportBatch(await requireUserId(request), params.batchId),
		{
			detail: { operationId: "getCreditCardImportsBatchByBatchId" },
			params: t.Object({ batchId: t.String({ maxLength: 36, minLength: 1 }) }),
			response: BatchUploadReturn,
		},
	)
	.post(
		"/batch",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			await assertCreditCardOwnership(body.creditCardId, userId);
			return enqueueImportBatch(userId, "credit-card", body.creditCardId, body.files, {
				password: body.password,
				provider: body.provider,
				statementId: body.statementId,
			});
		},
		{
			body: t.Object({ ...batchUploadProperties, files: t.Files({ minItems: 1 }) }),
			detail: { operationId: "postCreditCardImportsBatch" },
			parse: "multipart/form-data",
			response: BatchUploadAccepted,
		},
	)

	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			await assertCreditCardOwnership(body.creditCardId, userId);
			return createUploadedCreditCardImport(userId, body);
		},
		{
			body: CreateCreditCardImportBody,
			detail: { operationId: "postCreditCardImports" },
			parse: "multipart/form-data",
		},
	)
	.patch(
		"/:id/items/:itemId",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const creditCardImport = await getImport(userId, params.id);
			if (creditCardImport.status !== "PENDING")
				throw new HttpException("Esta importação já foi aprovada", 400);
			if (body.taxPurchaseItemId) {
				await associateImportedTax(userId, params.id, params.itemId, body.taxPurchaseItemId, {
					amount: body.totalAmount,
					name: body.description,
				});
				return getImportReturn(userId, params.id);
			}
			const current = await queryFirst(
				db.sql.public.CreditCardImportItem.select(
					"id",
					"description",
					"metadataMissing",
					"taxes",
					"currentInstallment",
					"installmentAmount",
					"isStatementCharge",
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
			const missing = (current.metadataMissing as string[]).filter(
				field =>
					!(field === "total" && body.totalAmount !== undefined) &&
					!(field === "purchaseDate" && body.purchaseDate !== undefined) &&
					!(field === "installments" && body.installments !== undefined) &&
					!(field === "calendar" && body.statementDate && body.dueDate),
			);
			if (body.statementDate && body.dueDate)
				await executeStatement(
					db.sql.public.CreditCardImport.update({
						dueDate: body.dueDate,
						statementDate: body.statementDate,
						updatedAt: new Date(),
					})
						.where((f, fn) => fn.eq(f.id, params.id))
						.build(),
				);
			const installments = body.installments ?? current.installments;
			const totalAmount = body.totalAmount ?? Number(current.totalAmount);
			const isStatementCharge = body.isStatementCharge ?? current.isStatementCharge;
			if (
				importedAnticipation(current.description) &&
				(isStatementCharge || installments !== current.installments)
			)
				throw new HttpException(
					"Antecipação não permite alterar o parcelamento nem virar encargo",
					400,
				);
			if (
				isStatementCharge &&
				(installments !== 1 ||
					body.debtSplit ||
					(body.taxes ?? readImportTaxes(current.taxes)).length)
			)
				throw new HttpException("Encargos não permitem rateio ou parcelamento automático", 400);
			let installmentAmount: number;
			try {
				installmentAmount = getEditedInstallmentAmount({
					currentInstallment: current.currentInstallment,
					installmentAmount: Number(current.installmentAmount),
					installments,
					previousInstallments: current.installments,
					totalAmount,
				});
			} catch (error) {
				throw new HttpException(
					error instanceof HttpException ? error.message : "Valores das parcelas inválidos",
					400,
				);
			}
			if (
				body.taxes?.some(tax => !tax.name.trim()) ||
				(body.taxes ?? readImportTaxes(current.taxes)).reduce((sum, tax) => sum + tax.amount, 0) >
					totalAmount
			)
				throw new HttpException("Impostos devem ter nome e não podem exceder o total da compra", 400);
			const tagIds =
				body.tagIds === undefined ? undefined : await assertTagOwnership(body.tagIds, userId);
			const description = preserveFinancedOperation(
				current.description,
				body.description?.trim() ?? current.description,
			);
			const preservedDescription =
				importedAnticipation(current.description) && body.description !== undefined
					? withImportedAnticipation(description, importedAnticipation(current.description)!)
					: description;
			await executeStatement(
				db.sql.public.CreditCardImportItem.update({
					description:
						body.description === undefined
							? current.description
							: getFinancingSource(current.description)
								? withFinancingSource(
										preservedDescription,
										getFinancingSource(current.description)!,
									)
								: getFinancingTarget(current.description)
									? withFinancingTarget(
											preservedDescription,
											getFinancingTarget(current.description)!,
										)
									: pendingPurchaseId(current.description)
										? withPendingPurchase(
												withoutPendingPurchase(preservedDescription),
												pendingPurchaseId(current.description)!,
											)
										: preservedDescription,
					installmentAmount: String(installmentAmount),
					installments,
					isSelected: body.isSelected ?? current.isSelected,
					isStatementCharge,
					metadataMissing: missing,
					...(body.taxes !== undefined
						? { taxes: body.taxes.map(tax => ({ ...tax, name: tax.name.trim() })) }
						: {}),
					purchaseDate: body.purchaseDate ? body.purchaseDate : current.purchaseDate,
					storeName:
						body.storeName === undefined ? current.storeName : body.storeName?.trim() || null,
					...(body.time !== undefined && { time: body.time }),
					totalAmount: String(totalAmount),
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, current.id))
					.build(),
			);
			if (tagIds) {
				const currentTags = await getTagsByEntity(importItemTagEntityType, [current.id]);
				if (tagIds.length || currentTags.has(current.id))
					await replaceEntityTags({
						entityIds: [current.id],
						entityType: importItemTagEntityType,
						tagIds,
					});
			}
			if (body.debtSplit !== undefined)
				await replaceDebtSplit({
					amount: totalAmount,
					split: isStatementCharge ? null : body.debtSplit,
					target: { creditCardImportItemId: current.id },
					userId,
				});
			return getImportReturn(userId, params.id);
		},
		{
			body: CreditCardImportItemUpdateDTO,
			detail: { operationId: "patchCreditCardImportsByIdItemsByItemId" },
			params: t.Object({ id: t.String(), itemId: t.String() }),
		},
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
					"currentInstallment",
					"installmentAmount",
					"isStatementCharge",
					"installments",
					"purchaseDate",
					"reconciledCreditPurchaseId",
					"storeName",
					"time",
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
			if (!item) throw new HttpException("Compra importada não encontrada", 404);
			const candidates = await getPotentialDuplicates(
				creditCardImport.creditCardId,
				[
					{
						...item,
						description: withoutPendingPurchase(item.description),
						reconciledCreditPurchaseId: null,
					},
				],
				params.id,
			);
			const duplicate = (candidates.get(item.id) ?? []).find(
				candidate => candidate.id === body.creditPurchaseId,
			);
			if (!duplicate)
				throw new HttpException("A compra selecionada não corresponde às parcelas importadas", 409);
			if (duplicate.id.startsWith("pending:")) {
				const sourceId = duplicate.id.slice(8);
				await executeStatement(
					db.sql.public.CreditCardImportItem.update({
						description: withPendingPurchase(item.description, sourceId),
						reconciledCreditPurchaseId: null,
						updatedAt: new Date(),
					})
						.where((f, fn) => fn.eq(f.id, item.id))
						.build(),
				);
				return getImportReturn(userId, params.id);
			}
			const itemTags = await getTagsByEntity(importItemTagEntityType, [item.id]);
			const duplicateTags = await getTagsByEntity(tagEntityType.creditPurchase, [duplicate.id]);
			const source = <T>(
				field: "debtSplit" | "description" | "purchaseDate" | "storeName" | "tagIds" | "time",
				imported: T,
				existing: T,
			) => (body.sources?.[field] === "duplicate" ? existing : imported);
			const tagIds = await assertTagOwnership(
				source(
					"tagIds",
					(itemTags.get(item.id) ?? []).map(tag => tag.id),
					(duplicateTags.get(duplicate.id) ?? []).map(tag => tag.id),
				),
				userId,
			);
			const debtSplit = source(
				"debtSplit",
				await getDebtSplitInput({ creditCardImportItemId: item.id }),
				await getDebtSplitInput({ creditPurchaseId: duplicate.id }),
			);
			await executeStatement(
				db.sql.public.CreditCardImportItem.update({
					description: importedAnticipation(item.description)
						? withImportedAnticipation(
								duplicate.description,
								importedAnticipation(item.description)!,
							)
						: source("description", item.description, duplicate.description),
					purchaseDate: importedAnticipation(item.description)
						? dateKey(duplicate.purchaseDate)
						: source("purchaseDate", item.purchaseDate, dateKey(duplicate.purchaseDate)),
					reconciledCreditPurchaseId: body.creditPurchaseId,
					storeName: importedAnticipation(item.description)
						? duplicate.storeName
						: source("storeName", item.storeName, duplicate.storeName),
					time: source("time", item.time, duplicate.time),
					totalAmount: importedAnticipation(item.description)
						? String(duplicate.totalAmount)
						: String(item.totalAmount),
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, item.id))
					.build(),
			);
			await replaceEntityTags({ entityIds: [item.id], entityType: importItemTagEntityType, tagIds });
			await replaceDebtSplit({
				amount: Number(item.totalAmount),
				split: item.isStatementCharge ? null : (debtSplit ?? null),
				target: { creditCardImportItemId: item.id },
				userId,
			});
			return getImportReturn(userId, params.id);
		},
		{
			body: CreditCardImportItemReconcileDTO,
			detail: { operationId: "postCreditCardImportsByIdItemsByItemIdReconcile" },
			params: t.Object({ id: t.String(), itemId: t.String() }),
		},
	)
	.post(
		"/:id/items/:itemId/approve",
		async ({ params, request, body }) => {
			const userId = await requireUserId(request);
			return body?.recurrence
				? approveWithRecurrence(userId, params.id, params.itemId, body.recurrence)
				: approveItems(userId, params.id, params.itemId);
		},
		{
			body: ApproveImportItemBody,
			detail: { operationId: "postCreditCardImportsByIdItemsByItemIdApprove" },
		},
	)
	.post(
		"/:id/approve",
		async ({ params, request, body }) =>
			approveItems(await requireUserId(request), params.id, undefined, body?.includeUnmatched ?? true),
		{
			body: t.Optional(t.Object({ includeUnmatched: t.Optional(t.Boolean()) })),
			detail: { operationId: "postCreditCardImportsByIdApprove" },
		},
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const creditCardImport = await getImport(userId, params.id);
			if (creditCardImport.status !== "PENDING")
				throw new HttpException("Importação já finalizada", 400);
			const items = await queryRows(
				db.sql.public.CreditCardImportItem.select("id")
					.where((fields, functions) =>
						functions.eq(fields.creditCardImportId, creditCardImport.id),
					)
					.build(),
			);
			await cleanupItemTags(items.map(item => item.id));
			await executeStatement(
				db.sql.public.CreditCardImport.delete()
					.where((fields, functions) => functions.eq(fields.id, creditCardImport.id))
					.build(),
			);
			return { success: true };
		},
		{ detail: { operationId: "deleteCreditCardImportsById" } },
	)
	.get(
		"/:id/tax-sources",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const imported = await getImport(userId, params.id);
			const book = await readCreditBook(userId, imported.creditCardId);
			return creditBookEntries(book)
				.filter(
					row =>
						!row.isRefund &&
						!row.isStatementCharge &&
						!row.isSettled &&
						book.statements.some(
							s =>
								s.id === row.statementId &&
								s.statementDate === dateKey(imported.statementDate) &&
								s.dueDate === dateKey(imported.dueDate),
						),
				)
				.flatMap(row =>
					row.purchaseId
						? [
								{
									description: row.description,
									id: row.purchaseId,
									installmentAmount: row.installmentAmount,
									purchaseDate: row.purchaseDate,
									storeName: row.storeName ?? null,
								},
							]
						: [],
				);
		},
		{
			response: t.Array(
				t.Object({
					description: t.String(),
					id: t.String(),
					installmentAmount: t.Number(),
					purchaseDate: t.String(),
					storeName: t.Nullable(t.String()),
				}),
			),
		},
	)
	.get(
		"/:id/refund-sources",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const imported = await getImport(userId, params.id);
			await combinePendingAnticipationRefunds(userId, params.id);
			const book = await readCreditBook(userId, imported.creditCardId);
			const pending = await queryRaw<{
				id: string;
				description: string;
				installments: number;
				purchaseDate: Date;
				totalAmount: string;
			}>(
				`SELECT * FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1 AND "installmentAmount">0 AND NOT "isStatementCharge"`,
				[params.id],
			);
			const refundItems = await queryRaw<{
				reconciledCreditPurchaseId: string | null;
				installmentAmount: string;
				purchaseDate: Date;
				externalId: string;
				description: string;
			}>(
				`SELECT * FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1 AND "installmentAmount"<0`,
				[params.id],
			);
			const sources = pending
				.filter(p => !importedAnticipation(p.description) && !getFinancingSource(p.description))
				.map(p => ({
					description: p.description,
					id: `pending:${p.id}`,
					installments: p.installments,
					purchaseDate: dateKey(p.purchaseDate),
					refundableAmount: Number(p.totalAmount),
					totalAmount: Number(p.totalAmount),
				}));
			return [
				...sources,
				...book.purchases.map(p => ({
					description: p.description,
					id: p.id,
					installments: p.installmentAmountsCents.length,
					purchaseDate: p.purchaseDate,
					refundableAmount:
						(p.totalAmountCents +
							Math.max(
								0,
								...refundItems
									.filter(
										item =>
											!item.reconciledCreditPurchaseId ||
											item.reconciledCreditPurchaseId === p.id,
									)
									.map(
										item =>
											existingImportedRefund(book.refunds, p.id, {
												amount: Math.abs(Number(item.installmentAmount)),
												creditDate: dateKey(item.purchaseDate),
												externalId: item.externalId,
											})?.amountCents ?? 0,
									),
							) -
							book.refunds
								.filter(r => r.purchaseId === p.id && !r.deletedAt)
								.reduce((sum, r) => sum + r.amountCents, 0)) /
						100,
					totalAmount: p.totalAmountCents / 100,
				})),
			];
		},
		{ detail: { operationId: "getCreditCardImportsByIdRefundSources" } },
	)
	.patch(
		"/:id/items/:itemId/refund-review",
		async ({ params, body, request }) =>
			saveRefundReview(await requireUserId(request), params.id, params.itemId, body),
		{ body: RefundImportReviewDTO, response: SavedRefundImportReviewReturn },
	)
	.post(
		"/:id/items/:itemId/approve-refund",
		async ({ params, body, request }) =>
			approveReviewedRefund(await requireUserId(request), params.id, params.itemId, body),
		{ body: RefundImportReviewDTO, response: t.Object({ created: t.Number(), finished: t.Boolean() }) },
	);
