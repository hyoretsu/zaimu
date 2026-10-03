import { importedAnticipation, withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { getTagsByEntity, tagEntityType } from "~/modules/categories/application/tag-assignments";
import { type CreditReadRow, readCreditEntries } from "~/modules/creditCards/application/credit-entry-reader";
import { mutateCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import {
	recalculateStatementPayments,
	withStatementPayments,
} from "~/modules/creditCards/application/statement-payments";
import { linkPurchaseToDebt, syncPurchaseDebtEvent } from "~/modules/debts/application/debt-ledger";
import { getDebtSplitInput, getDebtSplitReturns } from "~/modules/debts/application/debt-splits";
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
import { matchesExistingCreditPurchase } from "../domain/credit-card-import-reconciliation";
import { getFinancingSource, getFinancingTarget } from "../domain/financing-source-reference";
import { materializeImportedPurchase } from "./materialize-imported-purchase";

const importItemTagEntityType = "CREDIT_CARD_IMPORT_ITEM";
const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

export async function getPotentialDuplicates(
	creditCardId: string,
	items: Array<{
		description: string;
		id: string;
		installmentAmount: number | string;
		installments: number;
		purchaseDate: Date | string;
		reconciledCreditPurchaseId: null | string;
		storeName: null | string;
		totalAmount: number | string;
	}>,
) {
	const entries = await readCreditEntries(creditCardId);
	const candidates = entries.filter(p => !p.parentId && !p.isRefund && !p.isStatementCharge);
	const children = entries.filter(p => p.parentId && candidates.some(c => c.id === p.parentId));
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
		const matches = candidatesWithCounts.filter(candidate =>
			importedAnticipation(item.description)
				? candidate.installments === item.installments &&
					(candidate.description.normalize("NFKC").trim().toLocaleLowerCase("pt-BR") ===
						withoutImportedAnticipation(item.description)
							.normalize("NFKC")
							.trim()
							.toLocaleLowerCase("pt-BR") ||
						Math.abs(Number(candidate.totalAmount) - Number(item.totalAmount)) <= 1)
				: /^FIN /u.test(item.description)
					? /^FIN /u.test(candidate.description) &&
						candidate.installments === item.installments &&
						dateKey(candidate.purchaseDate) === dateKey(item.purchaseDate)
					: matchesExistingCreditPurchase(item, candidate),
		);
		if (matches.length) result.set(item.id, matches);
	}
	return result;
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
	const statement = await queryFirst(
		db.sql.public.CreditCardStatement.select("id")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.creditCardId, creditCardId),
					functions.eq(fields.statementDate, statementDate),
				),
			)
			.limit(1)
			.build(),
	);
	if (statement) {
		await executeStatement(
			db.sql.public.CreditCardStatement.update({ dueDate, isFullySynced: true, updatedAt: new Date() })
				.where((fields, functions) => functions.eq(fields.id, statement.id))
				.build(),
		);
		return;
	}
	await executeStatement(
		db.sql.public.CreditCardStatement.insert([
			{ creditCardId, dueDate, isFullySynced: true, statementDate, totalAmount: "0" },
		]).build(),
	);
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

export async function getImportReturn(
	userId: string,
	importId: string,
	page: { cursor?: string; limit?: number } = {},
) {
	const creditCardImport = await getImport(userId, importId);
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
	const duplicates = await getPotentialDuplicates(creditCardImport.creditCardId, items);

	for (const item of items)
		if (
			importedAnticipation(item.description) &&
			!item.reconciledCreditPurchaseId &&
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
	for (const itemId of itemIds) {
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

export async function approveItems(userId: string, importId: string, itemId?: string) {
	return withRawTransaction(() => approveItemsImpl(userId, importId, itemId));
}

async function approveItemsImpl(userId: string, importId: string, itemId?: string) {
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
	const duplicates = await getPotentialDuplicates(creditCardImport.creditCardId, allItems);

	for (const item of allItems)
		if (
			importedAnticipation(item.description) &&
			!item.reconciledCreditPurchaseId &&
			!duplicates.has(item.id)
		)
			duplicates.set(item.id, []);
	const selectedItems = allItems
		.filter(item =>
			itemId
				? item.id === itemId
				: !duplicates.has(item.id) &&
					Number(item.installmentAmount) >= 0 &&
					!(item.metadataMissing as string[]).length,
		)
		.toSorted(
			(left, right) =>
				Number(!!getFinancingSource(left.description)) - Number(!!getFinancingSource(right.description)),
		);
	if (itemId && !selectedItems.length)
		throw new HttpException("Concilie a antecipação ou a compra existente antes de aprovar", 409);
	if (itemId && duplicates.has(itemId))
		throw new HttpException("Concilie as possíveis parcelas existentes antes de aprovar", 400);
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
		const debtSplit = await getDebtSplitInput({ creditCardImportItemId: item.id });
		// An interrupted approval can have created the root before deleting the import item.
		const importedRoot = (
			await queryRaw<CreditReadRow>(
				`SELECT * FROM "CreditEntry" WHERE "externalId"=$1 AND "creditCardId"=$2 LIMIT 1`,
				[item.externalId, creditCardImport.creditCardId],
			)
		)[0];
		if (importedAnticipation(item.description) && !item.reconciledCreditPurchaseId && !importedRoot)
			throw new HttpException("Vincule a antecipação à compra original antes de aprovar", 409);
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
				userId,
			},
			{
				...item,
				debtSplitRule: debtSplit ?? null,
				dueDate: creditCardImport.dueDate,
				existingRootId: item.reconciledCreditPurchaseId ?? importedRoot?.id ?? null,
				installmentAmount: Number(item.installmentAmount),
				statementDate: creditCardImport.statementDate,
				tagIds: (tagsByItem.get(item.id) ?? []).map(tag => tag.id),
				totalAmount: Number(item.totalAmount),
			},
		);
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
		const settlementRootId = financingTarget?.id ?? rootId;
		if (settlementSource)
			await mutateCreditBook(userId, card.id, book => {
				const source = book.installments.find(i => i.id === settlementSource.id);
				if (!source) throw new HttpException("Parcela original não encontrada", 409);
				if (source.settledByPurchaseId && source.settledByPurchaseId !== settlementRootId)
					throw new HttpException("Compra vinculada a outro parcelamento", 409);
				source.isSettled = true;
				source.settledByPurchaseId = settlementRootId;
			});
		if (Number(item.installmentAmount) < 0 || item.isStatementCharge || /^FIN /u.test(item.description))
			continue;
		const debtInput = {
			creditPurchaseId: rootId,
			date: dateKey(item.purchaseDate),
			debtSplit: debtSplit ?? null,
			description: item.storeName || item.description,
			totalAmount: Number(item.totalAmount),
			userId,
		};
		if (item.reconciledCreditPurchaseId || importedRoot) await syncPurchaseDebtEvent(debtInput);
		else if (debtSplit) await linkPurchaseToDebt({ ...debtInput, debtSplit });
		await settleExternalReview(item.id, item.isStatementCharge ? "CHARGE" : "PURCHASE", rootId);
		await refreshAppliedSnapshots(userId, rootId);
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
