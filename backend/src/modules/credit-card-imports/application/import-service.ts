import { synchronizeImportedStatementDates } from "@zaimu/finance/credit-book";
import { distributePurchaseCents } from "@zaimu/finance/credit-purchase";
import { hasMatchingInstallmentSum } from "@zaimu/finance/credit-refund";
import {
	importedAnticipation,
	withImportedAnticipation,
	withoutImportedAnticipation,
} from "@zaimu/finance/imported-anticipation";
import {
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { type CreditReadRow, readCreditEntries } from "~/modules/creditCards/application/credit-entry-reader";
import { mutateCreditBook, readCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import {
	recalculateStatementPayments,
	withStatementPayments,
} from "~/modules/creditCards/application/statement-payments";
import { linkPurchaseToDebt, syncPurchaseDebtEvent } from "~/modules/debts/application/debt-ledger";
import {
	getDebtSplitInput,
	getDebtSplitReturns,
	replaceDebtSplit,
} from "~/modules/debts/application/debt-splits";
import {
	refreshAppliedSnapshots,
	settleExternalReview,
} from "~/modules/open-finance/application/review-tracking";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { HttpException } from "~/shared/errors";
import {
	db,
	executeStatement,
	queryFirst,
	queryRaw,
	queryRows,
	withRawTransaction,
	withTransaction,
} from "~/shared/infra/sql";
import { affectedImportMonths } from "../domain/affected-import-months";
import { anticipationRefundPairs } from "../domain/anticipation-refunds";
import { canBulkApprovePurchase } from "../domain/bulk-approval";
import {
	isPotentialPurchaseRefinancing,
	matchesExistingCreditPurchase,
	requiresPurchaseReconciliation,
} from "../domain/credit-card-import-reconciliation";
import { existingPurchaseImportValues } from "../domain/existing-purchase-import-values";
import { getFinancingSource, getFinancingTarget } from "../domain/financing-source-reference";
import { isInvoicePayment } from "../domain/invoice-payment";
import {
	includePendingPurchaseSources,
	pendingPurchaseId,
	withoutPendingPurchase,
	withPendingPurchase,
} from "../domain/pending-purchase-reference";
import { uniquePurchaseMatches } from "../domain/unique-purchase-matches";
import { materializeImportedPurchase, materializeImportedPurchases } from "./materialize-imported-purchase";

import { approveReviewedRefund } from "./refund-review";

const importItemTagEntityType = "CREDIT_CARD_IMPORT_ITEM";
const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

export async function getPotentialDuplicates(
	creditCardId: string,
	items: Array<{
		description: string;
		id: string;
		currentInstallment: number;
		installmentAmount: number | string;
		installments: number;
		purchaseDate: Date | string;
		reconciledCreditPurchaseId: null | string;
		storeName: null | string;
		totalAmount: number | string;
	}>,
	importId?: string,
) {
	const entries = await readCreditEntries(creditCardId);
	const candidates = entries.filter(p => !p.parentId && !p.isRefund && !p.isStatementCharge);
	const book =
		entries[0] && items.some(item => importedAnticipation(item.description))
			? await readCreditBook(entries[0].userId, creditCardId)
			: undefined;
	const plans = new Map(book?.purchases.map(p => [p.id, p.installmentAmountsCents]));
	const children = entries.filter(p => p.parentId && candidates.some(c => c.id === p.parentId));
	const reconciledItems = await queryRows(
		db.sql.public.CreditCardImportItem.select("reconciledCreditPurchaseId", "currentInstallment").build(),
	);
	const occupiedCandidateIds = new Set(
		reconciledItems.flatMap(item =>
			item.reconciledCreditPurchaseId
				? [`${item.reconciledCreditPurchaseId}:${item.currentInstallment}`]
				: [],
		),
	);
	const childCounts = new Map<string, number>();
	for (const child of children) {
		if (child.parentId) childCounts.set(child.parentId, (childCounts.get(child.parentId) ?? 0) + 1);
	}
	const candidatesWithCounts = candidates.map(candidate => ({
		currentInstallment: candidate.currentInstallment,
		description: candidate.description,
		existingInstallments: 1 + (childCounts.get(candidate.id) ?? 0),
		id: candidate.id,
		installmentAmount: candidate.installmentAmount,
		installments: candidate.installments,
		isSettled: candidate.isSettled,
		purchaseDate: candidate.purchaseDate,
		settledByPurchaseId: candidate.settledByPurchaseId,
		storeName: candidate.storeName,
		time: candidate.time,
		totalAmount: candidate.totalAmount,
	}));
	if (importId) {
		const pending = await queryRaw<
			Pick<
				CreditReadRow,
				| "id"
				| "description"
				| "installments"
				| "purchaseDate"
				| "totalAmount"
				| "installmentAmount"
				| "storeName"
				| "time"
				| "currentInstallment"
			>
		>(
			`SELECT i.* FROM "CreditCardImportItem" i WHERE i."creditCardImportId"=$1 AND NOT i."isStatementCharge" AND i."installmentAmount">0`,
			[importId],
		);
		for (const source of pending) {
			if (importedAnticipation(source.description) || getFinancingSource(source.description)) continue;
			candidatesWithCounts.push({
				...source,
				existingInstallments: 0,
				id: `pending:${source.id}`,
				isSettled: false,
				settledByPurchaseId: null,
			});
		}
	}
	const result = new Map<string, typeof candidatesWithCounts>();
	for (const item of items) {
		if (
			Number(item.installmentAmount) < 0 ||
			item.reconciledCreditPurchaseId ||
			pendingPurchaseId(item.description)
		)
			continue;
		const matches = candidatesWithCounts.filter(
			candidate =>
				!occupiedCandidateIds.has(`${candidate.id}:${item.currentInstallment}`) &&
				(importedAnticipation(item.description)
					? hasMatchingInstallmentSum(
							plans.get(candidate.id) ??
								distributePurchaseCents(
									Math.round(Number(candidate.totalAmount) * 100),
									candidate.installments,
								),
							importedAnticipation(item.description)!.reduce((sum, part) => sum + part.amountCents, 0),
						)
					: candidate.id.startsWith("pending:")
						? false
						: /^FIN /u.test(item.description)
							? /^FIN /u.test(candidate.description) &&
								candidate.installments === item.installments &&
								dateKey(candidate.purchaseDate) === dateKey(item.purchaseDate)
							: matchesExistingCreditPurchase(item, candidate, 1) ||
								(!candidate.isSettled &&
									!candidate.settledByPurchaseId &&
									isPotentialPurchaseRefinancing(item, candidate))),
		);
		if (matches.length) result.set(item.id, matches);
	}
	return result;
}

async function reconcileUniquePurchases(userId: string, importId: string, creditCardId: string) {
	await withRawTransaction(async () => {
		await queryRaw(`SELECT "id" FROM "CreditCard" WHERE "id"=$1 FOR UPDATE`, [creditCardId]);
		const items = await queryRaw<
			Parameters<typeof getPotentialDuplicates>[1][number] & { createdAt: Date; updatedAt: Date }
		>(`SELECT * FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1`, [importId]);
		const duplicates = await getPotentialDuplicates(creditCardId, items, importId);
		const entries = await readCreditEntries(creditCardId);
		for (const [itemId, candidate] of uniquePurchaseMatches(
			duplicates,
			(itemId, candidate) => {
				const item = items.find(item => item.id === itemId)!;
				return !importedAnticipation(item.description) && matchesExistingCreditPurchase(item, candidate, 1);
			},
			(itemId, candidate) =>
				dateKey(candidate.purchaseDate) === dateKey(items.find(item => item.id === itemId)!.purchaseDate),
		)) {
			const item = items.find(item => item.id === itemId)!;
			if (requiresPurchaseReconciliation(item)) continue;
			// Broader value-only review candidates are not proof for automatic linking.
			if (
				importedAnticipation(item.description) &&
				(candidate.installments !== item.installments ||
					!(
						candidate.description.normalize("NFKC").trim().toLocaleLowerCase("pt-BR") ===
							withoutImportedAnticipation(item.description)
								.normalize("NFKC")
								.trim()
								.toLocaleLowerCase("pt-BR") ||
						Math.abs(Number(candidate.totalAmount) - Number(item.totalAmount)) <= 1
					))
			)
				continue;
			const original = entries.find(entry => entry.id === candidate.id);
			if (!original) continue;
			const values = existingPurchaseImportValues(item.description, original);
			await executeStatement(
				db.sql.public.CreditCardImportItem.update({
					...values,
					reconciledCreditPurchaseId: original.id,
					updatedAt: new Date(),
				})
					.where((f, fn) => fn.eq(f.id, itemId))
					.build(),
			);
			const tags = await getTagsByEntity(tagEntityType.creditPurchase, [original.id]);
			await replaceEntityTags({
				entityIds: [itemId],
				entityType: importItemTagEntityType,
				tagIds: (tags.get(original.id) ?? []).map(tag => tag.id),
			});
			await replaceDebtSplit({
				amount: Number(values.totalAmount ?? item.totalAmount),
				split: (await getDebtSplitInput({ creditPurchaseId: original.id })) ?? null,
				target: { creditCardImportItemId: itemId },
				userId,
			});
		}
	});
}

export async function getImport(userId: string, importId: string) {
	const creditCardImport = await queryFirst(
		db.sql.public.CreditCardImport.select(
			"id",
			"creditCardId",
			"provider",
			"status",
			"fileName",
			"reportedPreviousBalance",
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

export async function markStatementAsFullySynced({
	creditCardId,
	dueDate,
	statementDate,
}: {
	creditCardId: string;
	dueDate: Date;
	statementDate: Date;
}) {
	const [owner] = await queryRaw<{ userId: string }>(
		`SELECT a."userId" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE c."id"=$1`,
		[creditCardId],
	);
	if (!owner) throw new HttpException("Cartão não encontrado", 404);
	await mutateCreditBook(owner.userId, creditCardId, book => {
		synchronizeImportedStatementDates(book, {
			dueDate: dateKey(dueDate),
			statementDate: dateKey(statementDate),
		}).isFullySynced = true;
	});
}

interface ImportItemsCursor {
	createdAt: string;
	id: string;
	purchaseDate: string;
}

const decodeImportItemsCursor = (cursor?: string): ImportItemsCursor | null => {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as ImportItemsCursor;
		if (
			!parsed.id ||
			Number.isNaN(Date.parse(parsed.createdAt)) ||
			Number.isNaN(Date.parse(parsed.purchaseDate))
		)
			throw new Error("invalid cursor");
		return parsed;
	} catch {
		throw new HttpException("Cursor inválido", 400);
	}
};

/** Normalize legacy pending batches before pagination or approval, under the batch lock. */
export async function combinePendingAnticipationRefunds(userId: string, importId: string) {
	await withRawTransaction(async query => {
		const [batch] = await query<{ status: string; creditCardId: string }>(
			`SELECT "status", "creditCardId" FROM "CreditCardImport" WHERE "id"=$1 AND "userId"=$2 FOR UPDATE`,
			[importId, userId],
		);
		if (batch?.status !== "PENDING") return;
		const items = await query<{
			id: string;
			description: string;
			installmentAmount: string;
			installments: number;
			purchaseDate: Date;
			totalAmount: string;
			reconciledCreditPurchaseId: string | null;
		}>(
			`SELECT * FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1 AND NOT "isStatementCharge" FOR UPDATE`,
			[importId],
		);
		const paymentIds = items.filter(item => isInvoicePayment(item.description)).map(item => item.id);
		if (paymentIds.length) {
			await cleanupItemTags(paymentIds);
			await query(`DELETE FROM "CreditCardImportItem" WHERE "id"=ANY($1)`, [paymentIds]);
		}
		const book = await readCreditBook(userId, batch.creditCardId);
		const sources = book.purchases.map(p => ({
			id: p.id,
			installmentAmountsCents: p.installmentAmountsCents,
			purchaseDate: p.purchaseDate,
			totalAmount: p.totalAmountCents / 100,
		}));
		for (const { anticipation, credit, installments, sourceId: matchedSourceId } of anticipationRefundPairs(
			items.filter(item => !isInvoicePayment(item.description)),
			sources,
		)) {
			let description = withImportedAnticipation(credit.description, installments);
			const sourceId = pendingPurchaseId(anticipation.description);
			if (sourceId) description = withPendingPurchase(description, sourceId);
			await query(
				`UPDATE "CreditCardImportItem" SET "description"=$2, "installments"=$3,
				"totalAmount"=$4, "reconciledCreditPurchaseId"=COALESCE("reconciledCreditPurchaseId", $5),
				"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
				[
					credit.id,
					description,
					anticipation.installments,
					-Math.max(Math.abs(Number(anticipation.totalAmount)), Math.abs(Number(credit.installmentAmount))),
					anticipation.reconciledCreditPurchaseId ?? matchedSourceId,
				],
			);
			await cleanupItemTags([anticipation.id]);
			await query(`DELETE FROM "CreditCardImportItem" WHERE "id"=$1`, [anticipation.id]);
		}
	});
}

export async function getImportReturn(
	userId: string,
	importId: string,
	page: { cursor?: string; limit?: number } = {},
) {
	const creditCardImport = await getImport(userId, importId);
	if (creditCardImport.status === "PENDING") {
		await combinePendingAnticipationRefunds(userId, importId);
		await reconcileUniquePurchases(userId, importId, creditCardImport.creditCardId);
	}
	const limit = Math.min(page.limit ?? 50, 100);
	const cursor = decodeImportItemsCursor(page.cursor);
	const itemPage = await queryRaw<{
		[key: string]: unknown;
		createdAt: Date;
		id: string;
		purchaseDate: Date;
		totalCount: number;
	}>(
		`SELECT "id", "createdAt", "purchaseDate", count(*) OVER()::integer AS "totalCount"
		 FROM "CreditCardImportItem"
		 WHERE "creditCardImportId" = $1
		   AND ($2::date IS NULL OR ("purchaseDate", "createdAt", "id") < ($2::date, $3::timestamp, $4::text))
		 ORDER BY "purchaseDate" DESC, "createdAt" DESC, "id" DESC
		 LIMIT $5`,
		[importId, cursor?.purchaseDate ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
	);
	const pageRows = itemPage.slice(0, limit);
	const itemIds = pageRows.map(item => item.id);
	const items = itemIds.length
		? await queryRows(
				db.sql.public.CreditCardImportItem.select(
					"id",
					"metadataMissing",
					"currentInstallment",
					"createdAt",
					"description",
					"externalId",
					"installmentAmount",
					"isStatementCharge",
					"installments",
					"isSelected",
					"purchaseDate",
					"reconciledCreditPurchaseId",
					"refundReview",
					"storeName",
					"time",
					"totalAmount",
					"updatedAt",
				)
					.where((fields, functions) => functions.in(fields.id, itemIds))
					.build(),
			)
		: [];
	const itemOrder = new Map(itemIds.map((id, index) => [id, index]));
	items.sort((left, right) => (itemOrder.get(left.id) ?? 0) - (itemOrder.get(right.id) ?? 0));
	const tags = await getTagsByEntity(
		importItemTagEntityType,
		items.map(item => item.id),
	);
	const duplicates = await getPotentialDuplicates(creditCardImport.creditCardId, items, importId);

	for (const item of items)
		if (
			importedAnticipation(item.description) &&
			!item.reconciledCreditPurchaseId &&
			!pendingPurchaseId(item.description) &&
			!duplicates.has(item.id)
		)
			duplicates.set(item.id, []);
	const duplicateCandidates = [...duplicates.values()].flat();
	const duplicateIds = duplicateCandidates.map(candidate => candidate.id);
	const duplicateTags = await getTagsByEntity(tagEntityType.creditPurchase, duplicateIds);
	const [duplicateDebtSplits, itemDebtSplits] = await Promise.all([
		getDebtSplitReturns(
			"creditPurchaseId",
			duplicateCandidates.map(candidate => ({ amount: Number(candidate.totalAmount), id: candidate.id })),
		),
		getDebtSplitReturns(
			"creditCardImportItemId",
			items.map(item => ({ amount: Number(item.totalAmount), id: item.id })),
		),
	]);
	const existingStatements = await queryRows(
		db.sql.public.CreditCardStatement.select("id", "creditCardId", "statementDate", "dueDate", "totalAmount")
			.where((f, fn) => fn.eq(f.creditCardId, creditCardImport.creditCardId))
			.build(),
	);
	if (
		!existingStatements.some(
			row => dateKey(row.statementDate).slice(0, 7) === dateKey(creditCardImport.statementDate).slice(0, 7),
		)
	)
		existingStatements.push({
			creditCardId: creditCardImport.creditCardId,
			dueDate: creditCardImport.dueDate,
			id: "import-cycle",
			statementDate: creditCardImport.statementDate,
			totalAmount: 0,
		});
	const balance = (await withStatementPayments(existingStatements, undefined, creditCardImport.dueDate)).find(
		row => dateKey(row.statementDate).slice(0, 7) === dateKey(creditCardImport.statementDate).slice(0, 7),
	);
	const previousBalanceCheck =
		creditCardImport.reportedPreviousBalance === null
			? null
			: {
					calculated: (balance?.carriedInAmount ?? 0) - (balance?.creditInAmount ?? 0),
					matches:
						Math.round(Number(creditCardImport.reportedPreviousBalance) * 100) ===
						Math.round(((balance?.carriedInAmount ?? 0) - (balance?.creditInAmount ?? 0)) * 100),
					reported: Number(creditCardImport.reportedPreviousBalance),
				};
	return {
		...creditCardImport,
		dueDate: dateKey(creditCardImport.dueDate),
		hasMore: itemPage.length > limit,
		items: items.map(item => ({
			...item,
			currentInstallment: item.currentInstallment,
			debtSplit: itemDebtSplits.get(item.id) ?? null,
			description: withoutPendingPurchase(item.description),
			duplicates: (duplicates.get(item.id) ?? []).map(candidate => ({
				...candidate,
				debtSplit: duplicateDebtSplits.get(candidate.id) ?? null,
				installmentAmount: Number(candidate.installmentAmount),
				purchaseDate: dateKey(candidate.purchaseDate),
				tagIds: (duplicateTags.get(candidate.id) ?? []).map(tag => tag.id),
				tags: duplicateTags.get(candidate.id) ?? [],
				totalAmount: Number(candidate.totalAmount),
			})),
			installmentAmount: Number(item.installmentAmount),
			purchaseDate: dateKey(item.purchaseDate),
			reconciledCreditPurchaseId:
				item.reconciledCreditPurchaseId ??
				(pendingPurchaseId(item.description) ? `pending:${pendingPurchaseId(item.description)}` : null),
			tagIds: (tags.get(item.id) ?? []).map(tag => tag.id),
			tags: tags.get(item.id) ?? [],
			totalAmount: Number(item.totalAmount),
		})),
		nextCursor: (() => {
			const last = pageRows.at(-1);
			return itemPage.length > limit && last
				? Buffer.from(
						JSON.stringify({
							createdAt: last.createdAt.toISOString(),
							id: last.id,
							purchaseDate: last.purchaseDate.toISOString(),
						}),
					).toString("base64url")
				: null;
		})(),
		pendingItemCount: itemPage[0]?.totalCount ?? 0,
		previousBalanceCheck,
		statementDate: dateKey(creditCardImport.statementDate),
	};
}

export async function cleanupItemTags(itemIds: string[]) {
	if (!itemIds.length) return;
	const reviews = await queryRaw<{ reviewItemId: string }>(
		`SELECT DISTINCT "reviewItemId" FROM "OpenFinanceRecord" WHERE "reviewItemId"=ANY($1::text[])`,
		[itemIds],
	);
	for (const { reviewItemId: itemId } of reviews) {
		const [target] = await queryRaw<{ id: string; kind: "PURCHASE" | "CHARGE" | "REFUND" }>(
			`SELECT e."id", CASE WHEN e."isRefund" THEN 'REFUND' WHEN e."isStatementCharge" THEN 'CHARGE' ELSE 'PURCHASE' END AS "kind" FROM "CreditCardImportItem" i JOIN "CreditCardImport" b ON b."id"=i."creditCardImportId" JOIN "CreditEntry" e ON e."creditCardId"=b."creditCardId" AND e."externalId"=i."externalId" WHERE i."id"=$1 LIMIT 1`,
			[itemId],
		);
		await settleExternalReview(itemId, target?.kind, target?.id);
	}

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

export async function approveItems(
	userId: string,
	importId: string,
	itemId?: string,
	includeUnmatched = true,
): Promise<{ created: number }> {
	return withRawTransaction(async () => {
		await queryRaw(`SELECT "id" FROM "CreditCardImport" WHERE "id"=$1 AND "userId"=$2 FOR UPDATE`, [
			importId,
			userId,
		]);
		if (itemId) {
			const [item] = await queryRaw<{ installmentAmount: number }>(
				`SELECT "installmentAmount" FROM "CreditCardImportItem" WHERE "id"=$1 AND "creditCardImportId"=$2`,
				[itemId, importId],
			);
			if (item && Number(item.installmentAmount) < 0) return approveReviewedRefund(userId, importId, itemId);
			return approveItemsImpl(userId, importId, itemId, includeUnmatched);
		}
		const result = await approveItemsImpl(userId, importId, undefined, includeUnmatched);
		const refunds = await queryRaw<{ id: string }>(
			`SELECT "id" FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1 AND "installmentAmount"<0 AND "refundReview" IS NOT NULL ORDER BY "createdAt", "id"`,
			[importId],
		);
		for (const refund of refunds) {
			await queryRaw("SAVEPOINT approve_import_refund");
			try {
				const approved = await approveReviewedRefund(userId, importId, refund.id);
				result.created += approved.created;
				await queryRaw("RELEASE SAVEPOINT approve_import_refund");
			} catch (error) {
				await queryRaw("ROLLBACK TO SAVEPOINT approve_import_refund");
				await queryRaw("RELEASE SAVEPOINT approve_import_refund");
				if (!(error instanceof HttpException) || error.statusCode >= 500) throw error;
			}
		}
		return result;
	});
}

async function approveItemsImpl(
	userId: string,
	importId: string,
	itemId: string | undefined,
	includeUnmatched: boolean,
) {
	await queryRaw(`SELECT "id" FROM "CreditCardImport" WHERE "id"=$1 AND "userId"=$2 FOR UPDATE`, [
		importId,
		userId,
	]);
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
	await combinePendingAnticipationRefunds(userId, importId);
	await reconcileUniquePurchases(userId, importId, creditCardImport.creditCardId);
	const allItems = await queryRows(
		db.sql.public.CreditCardImportItem.select(
			"id",
			"metadataMissing",
			"currentInstallment",
			"description",
			"externalId",
			"installmentAmount",
			"isStatementCharge",
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
	const duplicates = await getPotentialDuplicates(creditCardImport.creditCardId, allItems, importId);

	for (const item of allItems)
		if (
			importedAnticipation(item.description) &&
			!item.reconciledCreditPurchaseId &&
			!pendingPurchaseId(item.description) &&
			!duplicates.has(item.id)
		)
			duplicates.set(item.id, []);
	const selectedItems = allItems
		.filter(item =>
			itemId
				? item.id === itemId
				: canBulkApprovePurchase(
						{ ...item, metadataMissing: item.metadataMissing as string[] },
						duplicates.has(item.id),
						includeUnmatched,
					),
		)
		.toSorted(
			(left, right) =>
				Number(!!getFinancingSource(left.description)) - Number(!!getFinancingSource(right.description)),
		);
	try {
		const withSources = includePendingPurchaseSources(
			selectedItems,
			allItems,
			itemId
				? undefined
				: source => !duplicates.has(source.id) && (source.metadataMissing as string[]).length === 0,
		);
		selectedItems.splice(0, selectedItems.length, ...withSources);
	} catch (error) {
		throw new HttpException(error instanceof Error ? error.message : "Compra original inválida", 409);
	}
	if (itemId && !selectedItems.length)
		throw new HttpException("Concilie a antecipação ou a compra existente antes de aprovar", 409);
	if (itemId && duplicates.has(itemId))
		throw new HttpException("Concilie as possíveis parcelas existentes antes de aprovar", 400);
	for (const item of selectedItems)
		if (duplicates.has(item.id)) throw new HttpException("Concilie a compra original antes de aprovar", 409);
	for (const item of selectedItems)
		if ((item.metadataMissing as string[]).length)
			throw new HttpException("Complete os metadados obrigatórios antes de aprovar", 409);
	const tagsByItem = await getTagsByEntity(
		importItemTagEntityType,
		selectedItems.map(item => item.id),
	);
	const selectedExternalIds = new Set(selectedItems.map(item => item.externalId));
	for (const item of selectedItems)
		if (Number(item.installmentAmount) < 0)
			throw new HttpException("Vincule e aprove cada reembolso na revisão", 409);
	for (const item of selectedItems) {
		const sourceExternalId = getFinancingSource(item.description);
		if (!sourceExternalId || selectedExternalIds.has(sourceExternalId)) continue;
		const source = (
			await queryRaw<CreditReadRow>(
				`SELECT * FROM "CreditEntry" WHERE "externalId"=$1 AND "creditCardId"=$2 LIMIT 1`,
				[sourceExternalId, creditCardImport.creditCardId],
			)
		)[0];
		if (!source) throw new HttpException("Aprove a compra original antes de aprovar o parcelamento", 409);
	}
	const cardSnapshot = {
		...card,
		cashbackRate: card.cashbackRate === null ? null : Number(card.cashbackRate),
		cashbackYieldPeriod: card.cashbackYieldPeriod as "MONTHLY" | "YEARLY" | null,
		cashbackYieldReferencePercentage:
			card.cashbackYieldReferencePercentage === null ? null : Number(card.cashbackYieldReferencePercentage),
		cashbackYieldReferenceRate:
			card.cashbackYieldReferenceRate === null ? null : Number(card.cashbackYieldReferenceRate),
		userId,
	};
	const batchItems = selectedItems.filter(
		item => !getFinancingSource(item.description) && !getFinancingTarget(item.description),
	);
	const debtSplitsByItem = new Map<string, Awaited<ReturnType<typeof getDebtSplitInput>>>();
	const previousRootsByItem = new Map<string, CreditReadRow | undefined>();
	const batchInputs: Parameters<typeof materializeImportedPurchases>[1] = [];
	for (const item of batchItems) {
		const debtSplit = await getDebtSplitInput({ creditCardImportItemId: item.id });
		const [importedRoot] = await queryRaw<CreditReadRow>(
			`SELECT * FROM "CreditEntry" WHERE "externalId"=$1 AND "creditCardId"=$2 LIMIT 1`,
			[item.externalId, creditCardImport.creditCardId],
		);
		if (
			importedAnticipation(item.description) &&
			!item.reconciledCreditPurchaseId &&
			!pendingPurchaseId(item.description) &&
			!importedRoot
		)
			throw new HttpException("Vincule a antecipação à compra original antes de aprovar", 409);
		debtSplitsByItem.set(item.id, debtSplit);
		previousRootsByItem.set(item.id, importedRoot);
		batchInputs.push({
			...item,
			allowBankCorrection: true,
			debtSplitRule: debtSplit ?? null,
			description: withoutPendingPurchase(item.description),
			dueDate: creditCardImport.dueDate,
			existingRootId: item.reconciledCreditPurchaseId ?? importedRoot?.id ?? null,
			installmentAmount: Number(item.installmentAmount),
			pendingSourceItemId: pendingPurchaseId(item.description),
			statementDate: creditCardImport.statementDate,
			tagIds: (tagsByItem.get(item.id) ?? []).map(tag => tag.id),
			totalAmount: Number(item.totalAmount),
		});
	}
	const batchRootIds = await materializeImportedPurchases(cardSnapshot, batchInputs);
	const rootsByItem = new Map(batchItems.map((item, index) => [item.id, batchRootIds[index]!]));
	for (const item of selectedItems) {
		if (item.storeName) await resolveStore(userId, item.storeName);
		const financingSourceId = getFinancingSource(item.description);
		const financingTargetId = getFinancingTarget(item.description);
		const financingSource = financingSourceId
			? (
					await queryRaw<CreditReadRow>(
						`SELECT * FROM "CreditEntry" WHERE "externalId"=$1 AND "creditCardId"=$2 LIMIT 1`,
						[financingSourceId, creditCardImport.creditCardId],
					)
				)[0]
			: null;
		if (financingSourceId && !financingSource)
			throw new HttpException("Aprove a compra original antes de aprovar o parcelamento", 409);
		const financingTarget = financingTargetId
			? (
					await queryRaw<CreditReadRow>(
						`SELECT * FROM "CreditEntry" WHERE "externalId"=$1 AND "creditCardId"=$2 LIMIT 1`,
						[financingTargetId, creditCardImport.creditCardId],
					)
				)[0]
			: null;
		const debtSplit = debtSplitsByItem.has(item.id)
			? debtSplitsByItem.get(item.id)
			: await getDebtSplitInput({ creditCardImportItemId: item.id });
		// An interrupted approval can have created the root before deleting the import item.
		const importedRoot = rootsByItem.has(item.id)
			? previousRootsByItem.get(item.id)
			: (
					await queryRaw<CreditReadRow>(
						`SELECT * FROM "CreditEntry" WHERE "externalId"=$1 AND "creditCardId"=$2 LIMIT 1`,
						[item.externalId, creditCardImport.creditCardId],
					)
				)[0];
		if (
			importedAnticipation(item.description) &&
			!item.reconciledCreditPurchaseId &&
			!pendingPurchaseId(item.description) &&
			!importedRoot
		)
			throw new HttpException("Vincule a antecipação à compra original antes de aprovar", 409);
		const rootId =
			rootsByItem.get(item.id) ??
			(await materializeImportedPurchase(cardSnapshot, {
				...item,
				allowBankCorrection: true,
				debtSplitRule: debtSplit ?? null,
				dueDate: creditCardImport.dueDate,
				existingRootId: item.reconciledCreditPurchaseId ?? importedRoot?.id ?? null,
				installmentAmount: Number(item.installmentAmount),
				statementDate: creditCardImport.statementDate,
				tagIds: (tagsByItem.get(item.id) ?? []).map(tag => tag.id),
				totalAmount: Number(item.totalAmount),
			}));
		if (!rootId) throw new HttpException("Não foi possível identificar a compra criada", 500);
		const settlementSource =
			financingSource ??
			(financingTarget
				? (
						await queryRaw<CreditReadRow>(
							`SELECT * FROM "CreditEntry" WHERE "id"=$1 AND "creditCardId"=$2 LIMIT 1`,
							[rootId, creditCardImport.creditCardId],
						)
					)[0]
				: null);
		const settlementRootId = financingTarget?.purchaseId ?? financingTarget?.id ?? rootId;
		if (settlementSource)
			await mutateCreditBook(userId, card.id, book => {
				const source = book.installments.find(i => i.id === settlementSource.id);
				if (!source) throw new HttpException("Parcela original não encontrada", 409);
				if (source.settledByPurchaseId && source.settledByPurchaseId !== settlementRootId)
					throw new HttpException("Compra vinculada a outro parcelamento", 409);
				source.isSettled = true;
				source.settledByPurchaseId = settlementRootId;
			});
		if (item.reconciledCreditPurchaseId && rootId !== item.reconciledCreditPurchaseId) {
			await settleExternalReview(item.id, "PURCHASE", rootId);
			await refreshAppliedSnapshots(userId, rootId);
			continue;
		}
		if (Number(item.installmentAmount) < 0 || item.isStatementCharge || /^FIN /u.test(item.description))
			continue;
		const debtInput = {
			creditPurchaseId: rootId,
			date: dateKey(item.purchaseDate),
			debtSplit: debtSplit ?? null,
			description: item.storeName || withoutPendingPurchase(item.description),
			totalAmount: Number(item.totalAmount),
			userId,
		};
		if (item.reconciledCreditPurchaseId || importedRoot) await syncPurchaseDebtEvent(debtInput);
		else if (debtSplit) await linkPurchaseToDebt({ ...debtInput, debtSplit });
		await settleExternalReview(item.id, item.isStatementCharge ? "CHARGE" : "PURCHASE", rootId);
		await refreshAppliedSnapshots(userId, rootId);
	}
	for (const source of batchItems) {
		const rootId = rootsByItem.get(source.id)!;
		await queryRaw(
			`UPDATE "CreditCardImportItem" SET "refundReview"=jsonb_set("refundReview"::jsonb, '{purchaseId}', to_jsonb($3::text))::json, "updatedAt"=CURRENT_TIMESTAMP WHERE "creditCardImportId"=$1 AND "refundReview"->>'purchaseId'=$2`,
			[importId, `pending:${source.id}`, rootId],
		);
		for (const dependent of allItems.filter(item => pendingPurchaseId(item.description) === source.id)) {
			await executeStatement(
				db.sql.public.CreditCardImportItem.update({
					description: withoutPendingPurchase(dependent.description),
					reconciledCreditPurchaseId: rootId,
					updatedAt: new Date(),
				})
					.where((f, fn) => fn.eq(f.id, dependent.id))
					.build(),
			);
		}
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
	const affectedMonths = affectedImportMonths(
		creditCardImport.statementDate,
		selectedItems.filter(item => !item.isStatementCharge && Number(item.installmentAmount) > 0),
	);
	if (affectedMonths.length) {
		const pendingImports = await queryRaw<{ id: string }>(
			`SELECT "id" FROM "CreditCardImport"
			 WHERE "creditCardId"=$1 AND "userId"=$2 AND "status"='PENDING'
			 AND "id"<>$3 AND to_char("statementDate", 'YYYY-MM')=ANY($4::text[])
			 ORDER BY "id"`,
			[creditCardImport.creditCardId, userId, importId, affectedMonths],
		);
		for (const pending of pendingImports)
			await reconcileUniquePurchases(userId, pending.id, creditCardImport.creditCardId);
	}
	const remaining = await queryFirst(
		db.sql.public.CreditCardImportItem.select("id")
			.where((fields, functions) => functions.eq(fields.creditCardImportId, importId))
			.limit(1)
			.build(),
	);
	if (!remaining) {
		await executeStatement(
			db.sql.public.CreditCardImport.update({ status: "APPROVED", updatedAt: new Date() })
				.where((fields, functions) => functions.eq(fields.id, importId))
				.build(),
		);
		await markStatementAsFullySynced(creditCardImport);
	}
	if (selectedItems.length)
		await withTransaction(executor =>
			recalculateStatementPayments(executor, [creditCardImport.creditCardId]),
		);
	return { created: selectedItems.length };
}
