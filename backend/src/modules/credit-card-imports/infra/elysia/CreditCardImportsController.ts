import { synchronizeImportedStatementDates } from "@zaimu/finance/credit-book";
import { statementEntryKind } from "@zaimu/finance/credit-card";
import { distributePurchaseCents } from "@zaimu/finance/credit-purchase";
import { hasMatchingInstallmentSum } from "@zaimu/finance/credit-refund";
import {
	importedAnticipation,
	withImportedAnticipation,
	withoutImportedAnticipation,
} from "@zaimu/finance/imported-anticipation";
import Elysia, { t } from "elysia";
import { assertCreditCardOwnership, requireUserId } from "~/modules/auth";
import {
	assertTagOwnership,
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { type CreditReadRow, readCreditEntries } from "~/modules/creditCards/application/credit-entry-reader";
import { mutateCreditBook, readCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { getDebtSplitInput, replaceDebtSplit } from "~/modules/debts/application/debt-splits";
import { createCreditCardBatch } from "~/modules/transaction-imports/application/import-batches";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { rejectLegacyFinancialFields } from "~/shared/infra/elysia/strict-json-body";
import { db, executeStatement, queryFirst, queryRaw, queryRows } from "~/shared/infra/sql";
import {
	approveItems,
	cleanupItemTags,
	combinePendingAnticipationRefunds,
	getImport,
	getImportReturn,
	getPotentialDuplicates,
	markStatementAsFullySynced,
} from "../../application/import-service";
import { approveReviewedRefund, saveRefundReview } from "../../application/refund-review";
import { combineAnticipationRefunds } from "../../domain/anticipation-refunds";
import { confirmedImportRoots } from "../../domain/confirmed-import-roots";
import { assignCreditCardPurchaseExternalIds } from "../../domain/credit-card-import-identity";
import { parseCreditCardStatementPdf } from "../../domain/credit-card-statement-parser";
import { getEditedInstallmentAmount } from "../../domain/edited-installment-amount";
import { existingImportRoots } from "../../domain/existing-import-roots";
import { existingImportedRefund } from "../../domain/existing-imported-refund";
import { existingPurchaseImportValues } from "../../domain/existing-purchase-import-values";
import { filterZeroValuePurchases } from "../../domain/filter-zero-value-purchases";
import {
	getFinancingSource,
	getFinancingTarget,
	preserveFinancedOperation,
	withFinancingSource,
	withFinancingTarget,
} from "../../domain/financing-source-reference";
import {
	pendingPurchaseId,
	withoutPendingPurchase,
	withPendingPurchase,
} from "../../domain/pending-purchase-reference";
import {
	resolveImportStatementDates,
	synchronizeNextImportedStatement,
} from "../../domain/resolve-import-statement-dates";
import { findPendingImport, selectNewImportPurchases } from "../../domain/select-new-import-purchases";
import {
	CreditCardImportItemReconcileDTO,
	CreditCardImportItemUpdateDTO,
	RefundImportReviewDTO,
	SavedRefundImportReviewReturn,
} from "./CreditCardImportsDTO";

const importItemTagEntityType = "CREDIT_CARD_IMPORT_ITEM";
const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

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
					queryRaw<{ id: string; fileName: string; pendingItemCount: number } & Record<string, unknown>>(
						`SELECT import."id", import."fileName", count(item."id")::integer AS "pendingItemCount"
			 FROM "CreditCardImport" import
			 LEFT JOIN "CreditCardImportItem" item ON item."creditCardImportId" = import."id"
			 WHERE import."userId" = $1 AND import."status" = 'PENDING'
			 GROUP BY import."id", import."fileName", import."createdAt"
			 ORDER BY import."createdAt" DESC`,
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
			const parsedStatement = await parseCreditCardStatementPdf(
				fileBytes.buffer,
				body.provider,
				body.password,
			);
			const resolvedDates = await mutateCreditBook(userId, body.creditCardId, book => {
				const dates = resolveImportStatementDates(parsedStatement, book, body.statementId);
				if (body.statementId) synchronizeImportedStatementDates(book, dates, body.statementId);
				if (parsedStatement.nextStatementDate)
					synchronizeNextImportedStatement(book, parsedStatement.nextStatementDate, dates.statementDate);
				return dates;
			});
			const statement = { ...parsedStatement, ...resolvedDates };
			const reportedPreviousBalance =
				statement.reportedPreviousBalance ??
				statement.purchases.find(purchase =>
					/^(saldo\s+(anterior|financiado)|saldo devedor anterior)/i.test(purchase.description.trim()),
				)?.installmentAmount;
			const importBook = await readCreditBook(userId, body.creditCardId);
			const purchases = combineAnticipationRefunds(
				assignCreditCardPurchaseExternalIds(
					filterZeroValuePurchases(
						statement.purchases.filter(purchase => statementEntryKind(purchase.description) !== "BALANCE"),
					),
					body.creditCardId,
				),
				importBook.purchases.map(p => ({
					id: p.id,
					installmentAmountsCents: p.installmentAmountsCents,
					purchaseDate: p.purchaseDate,
					totalAmount: p.totalAmountCents / 100,
				})),
			);
			const [existing, pending] = await Promise.all([
				queryRaw<CreditReadRow>(
					`SELECT * FROM "CreditEntry" WHERE "creditCardId"=$1 AND "externalId"=ANY($2)`,
					[body.creditCardId, purchases.map(p => p.externalId)],
				),
				queryRows(
					db.sql.public.CreditCardImportItem.innerJoin(db.sql.public.CreditCardImport, (fields, functions) =>
						functions.eq(fields.CreditCardImportItem.creditCardImportId, fields.CreditCardImport.id),
					)
						.select(fields => ({
							creditCardImportId: fields.CreditCardImportItem.creditCardImportId,
							currentInstallment: fields.CreditCardImportItem.currentInstallment,
							externalId: fields.CreditCardImportItem.externalId,
						}))
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
			const existingCardEntries = await readCreditEntries(body.creditCardId);
			const anticipatedPlans = purchases.some(
				p => p.installmentAmount > 0 && importedAnticipation(p.description),
			)
				? new Map(
						(await readCreditBook(userId, body.creditCardId, false)).purchases.map(p => [
							p.id,
							p.installmentAmountsCents,
						]),
					)
				: new Map<string, number[]>();
			const identities = await queryRaw<{ externalId: string; purchaseId: string }>(
				`SELECT i."externalId", i."purchaseId" FROM "CreditPurchaseImportIdentity" i
				 JOIN "CreditPurchaseRecord" p ON p."id"=i."purchaseId"
				 WHERE p."creditCardId"=$1 AND p."userId"=$2 AND i."externalId"=ANY($3::text[])`,
				[body.creditCardId, userId, purchases.map(p => p.externalId)],
			);
			const existingRoots = new Map([
				...confirmedImportRoots(purchases, existingCardEntries),
				...identities.map(identity => [identity.externalId, identity.purchaseId] as const),
				...existingImportRoots(existing),
			]);
			const existingRootIds = [...new Set(existingRoots.values())];
			const existingInstallments = existingCardEntries.filter(p =>
				existingRootIds.includes(p.purchaseId ?? p.id),
			);
			const newPurchases = selectNewImportPurchases(purchases, existingRoots, existingInstallments, pending);
			for (const purchase of newPurchases) {
				if (
					purchase.installmentAmount < 0 ||
					!importedAnticipation(purchase.description) ||
					purchase.reconciledCreditPurchaseId
				)
					continue;
				const matches = existingCardEntries.filter(
					entry =>
						!entry.parentId &&
						!entry.isRefund &&
						!entry.isStatementCharge &&
						entry.installments === purchase.installments &&
						hasMatchingInstallmentSum(
							anticipatedPlans.get(entry.id) ??
								distributePurchaseCents(Math.round(Number(entry.totalAmount) * 100), entry.installments),
							importedAnticipation(purchase.description)!.reduce((sum, part) => sum + part.amountCents, 0),
						) &&
						entry.description.normalize("NFKC").trim().toLocaleLowerCase("pt-BR") ===
							withoutImportedAnticipation(purchase.description)
								.normalize("NFKC")
								.trim()
								.toLocaleLowerCase("pt-BR") &&
						Math.abs(Number(entry.totalAmount) - purchase.totalAmount) <= 1,
				);
				if (matches.length === 1) {
					purchase.reconciledCreditPurchaseId = matches[0]!.id;
					purchase.purchaseDate = dateKey(matches[0]!.purchaseDate);
					purchase.totalAmount = Number(matches[0]!.totalAmount);
				}
			}
			const statementId = (
				await queryRaw<{ id: string }>(
					`SELECT "id" FROM "CreditCardStatement" WHERE "creditCardId"=$1 AND "statementDate"=$2::date LIMIT 1`,
					[body.creditCardId, statement.statementDate],
				)
			)[0]?.id;
			for (let index = newPurchases.length - 1; index >= 0; index--) {
				const purchase = newPurchases[index]!;
				const anticipated = importedAnticipation(purchase.description);
				if (
					purchase.installmentAmount < 0 ||
					!anticipated ||
					!purchase.reconciledCreditPurchaseId ||
					!statementId
				)
					continue;
				const rootId = purchase.reconciledCreditPurchaseId;
				if (
					anticipated.every(installment =>
						existingCardEntries.some(
							entry =>
								(entry.id === rootId || entry.parentId === rootId) &&
								entry.currentInstallment === installment.number &&
								entry.hasImportedAmount &&
								entry.statementId === statementId &&
								Math.round(Number(entry.installmentAmount) * 100) === installment.amountCents,
						),
					)
				)
					newPurchases.splice(index, 1);
			}
			const ignoredCount = purchases.length - newPurchases.length;
			if (!newPurchases.length) {
				const pendingImportId = findPendingImport(
					selectNewImportPurchases(purchases, existingRoots, existingInstallments, []),
					pending,
				);
				if (pendingImportId) {
					return { creditCardImport: await getImportReturn(userId, pendingImportId), ignoredCount };
				}
				await markStatementAsFullySynced({
					creditCardId: body.creditCardId,
					dueDate: new Date(`${statement.dueDate}T12:00:00`),
					statementDate: new Date(`${statement.statementDate}T12:00:00`),
				});
				return { creditCardImport: null, ignoredCount };
			}
			const creditCardImport = await createCreditCardBatch({
				creditCardId: body.creditCardId,
				dueDate: new Date(`${statement.dueDate}T12:00:00`),
				fileName: body.file.name.slice(0, 255),
				provider: statement.provider,
				reportedPreviousBalance:
					reportedPreviousBalance === undefined ? null : String(reportedPreviousBalance),
				statementDate: new Date(`${statement.statementDate}T12:00:00`),
				userId,
			});
			if (!creditCardImport) throw new HttpException("Não foi possível criar a importação", 500);
			await executeStatement(
				db.sql.public.CreditCardImportItem.insert(
					newPurchases.map(({ financingSourceExternalId, financingTargetExternalId, ...purchase }) => ({
						...purchase,
						creditCardImportId: creditCardImport.id,
						description: financingSourceExternalId
							? withFinancingSource(purchase.description, financingSourceExternalId)
							: financingTargetExternalId
								? withFinancingTarget(purchase.description, financingTargetExternalId)
								: purchase.description,
						installmentAmount: String(purchase.installmentAmount),
						isStatementCharge: statementEntryKind(purchase.description) === "CHARGE",
						purchaseDate: new Date(`${purchase.purchaseDate}T12:00:00`),
						...(purchase.reconciledCreditPurchaseId && {
							reconciledCreditPurchaseId: purchase.reconciledCreditPurchaseId,
						}),
						totalAmount: String(purchase.totalAmount),
					})),
				).build(),
			);
			const reconciledItems = await queryRows(
				db.sql.public.CreditCardImportItem.select(
					"id",
					"description",
					"reconciledCreditPurchaseId",
					"totalAmount",
				)
					.where((fields, functions) => functions.eq(fields.creditCardImportId, creditCardImport.id))
					.build(),
			);
			const existingTags = await getTagsByEntity(
				tagEntityType.creditPurchase,
				reconciledItems.flatMap(item =>
					item.reconciledCreditPurchaseId ? [item.reconciledCreditPurchaseId] : [],
				),
			);
			for (const item of reconciledItems) {
				const original = existingCardEntries.find(entry => entry.id === item.reconciledCreditPurchaseId);
				if (!original) continue;
				await executeStatement(
					db.sql.public.CreditCardImportItem.update(existingPurchaseImportValues(item.description, original))
						.where((fields, functions) => functions.eq(fields.id, item.id))
						.build(),
				);
				await replaceEntityTags({
					entityIds: [item.id],
					entityType: importItemTagEntityType,
					tagIds: (existingTags.get(original.id) ?? []).map(tag => tag.id),
				});
				await replaceDebtSplit({
					amount: Number(importedAnticipation(item.description) ? original.totalAmount : item.totalAmount),
					split: (await getDebtSplitInput({ creditPurchaseId: original.id })) ?? null,
					target: { creditCardImportItemId: item.id },
					userId,
				});
			}
			return { creditCardImport: await getImportReturn(userId, creditCardImport.id), ignoredCount };
		},
		{
			body: t.Object({
				creditCardId: t.String({ maxLength: 36, minLength: 1 }),
				file: t.File(),
				password: t.Optional(t.String({ maxLength: 128 })),
				provider: t.Union([
					t.Literal("MERCADO_PAGO"),
					t.Literal("BRADESCO"),
					t.Literal("INTER"),
					t.Literal("NUBANK"),
					t.Literal("PICPAY"),
					t.Literal("WILL_BANK"),
				]),
				statementId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
			}),
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
			const current = await queryFirst(
				db.sql.public.CreditCardImportItem.select(
					"id",
					"description",
					"metadataMissing",
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
						dueDate: new Date(body.dueDate),
						statementDate: new Date(body.statementDate),
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
				throw new HttpException("Antecipação não permite alterar o parcelamento nem virar encargo", 400);
			if (isStatementCharge && (installments !== 1 || body.debtSplit))
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
					error instanceof Error ? error.message : "Valores das parcelas inválidos",
					400,
				);
			}
			const tagIds = body.tagIds === undefined ? undefined : await assertTagOwnership(body.tagIds, userId);
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
								? withFinancingSource(preservedDescription, getFinancingSource(current.description)!)
								: getFinancingTarget(current.description)
									? withFinancingTarget(preservedDescription, getFinancingTarget(current.description)!)
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
					purchaseDate: body.purchaseDate ? new Date(`${body.purchaseDate}T12:00:00`) : current.purchaseDate,
					storeName: body.storeName === undefined ? current.storeName : body.storeName?.trim() || null,
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
					await replaceEntityTags({ entityIds: [current.id], entityType: importItemTagEntityType, tagIds });
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
						? withImportedAnticipation(duplicate.description, importedAnticipation(item.description)!)
						: source("description", item.description, duplicate.description),
					purchaseDate: importedAnticipation(item.description)
						? duplicate.purchaseDate
						: source("purchaseDate", item.purchaseDate, duplicate.purchaseDate),
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
		async ({ params, request }) => approveItems(await requireUserId(request), params.id, params.itemId),
		{ detail: { operationId: "postCreditCardImportsByIdItemsByItemIdApprove" } },
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
		},
		{ detail: { operationId: "deleteCreditCardImportsById" } },
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
			}>(`SELECT * FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1 AND "installmentAmount"<0`, [
				params.id,
			]);
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
										item => !item.reconciledCreditPurchaseId || item.reconciledCreditPurchaseId === p.id,
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
