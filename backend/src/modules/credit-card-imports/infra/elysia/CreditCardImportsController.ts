import { addBookRefund } from "@zaimu/finance/credit-book";
import { statementEntryKind } from "@zaimu/finance/credit-card";
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
import {
	mutateCreditBook,
	newBookPurchase,
	readCreditBook,
} from "~/modules/creditCards/application/normalized-credit-book";
import {
	recalculateStatementPayments,
	withStatementPayments,
} from "~/modules/creditCards/application/statement-payments";
import { getImportedInstallmentAmounts } from "~/modules/creditCards/domain/installment-amounts";
import { linkPurchaseToDebt, syncPurchaseDebtEvent } from "~/modules/debts/application/debt-ledger";
import {
	getDebtSplitInput,
	getDebtSplitReturns,
	replaceDebtSplit,
} from "~/modules/debts/application/debt-splits";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import {
	db,
	executeStatement,
	queryFirst,
	queryRaw,
	queryRows,
	withRawTransaction,
	withTransaction,
} from "~/shared/infra/sql";
import { materializeImportedPurchase } from "../../application/materialize-imported-purchase";
import { assignCreditCardPurchaseExternalIds } from "../../domain/credit-card-import-identity";
import { matchesExistingCreditPurchase } from "../../domain/credit-card-import-reconciliation";
import { parseCreditCardStatementPdf } from "../../domain/credit-card-statement-parser";
import { requiresCreditCardStatementPdfPassword } from "../../domain/credit-card-statement-password";
import { filterZeroValuePurchases } from "../../domain/filter-zero-value-purchases";
import {
	getFinancingSource,
	getFinancingTarget,
	preserveFinancedOperation,
	withFinancingSource,
	withFinancingTarget,
} from "../../domain/financing-source-reference";
import { matchLegacyFinancingRoots } from "../../domain/legacy-financing-roots";
import { selectNewImportPurchases } from "../../domain/select-new-import-purchases";
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
				: !candidate.externalId && matchesExistingCreditPurchase(item, candidate),
		);
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

async function markStatementAsFullySynced({
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

async function getImportReturn(
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
					"categoryId",
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
			"categoryId",
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
			itemId ? item.id === itemId : !duplicates.has(item.id) && Number(item.installmentAmount) >= 0,
		)
		.toSorted(
			(left, right) =>
				Number(!!getFinancingSource(left.description)) - Number(!!getFinancingSource(right.description)),
		);
	if (itemId && !selectedItems.length)
		throw new HttpException("Concilie a antecipação ou a compra existente antes de aprovar", 409);
	if (itemId && duplicates.has(itemId))
		throw new HttpException("Concilie as possíveis parcelas existentes antes de aprovar", 400);
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

export const CreditCardImportsController = new Elysia({ prefix: "/credit-card-imports" })
	.get("/", async ({ request, set }) => {
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
	})
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
			if (requiresCreditCardStatementPdfPassword(body.provider) && !body.password)
				throw new HttpException("Informe a senha do PDF", 400);
			if (body.file.type !== "application/pdf" && !body.file.name.toLowerCase().endsWith(".pdf"))
				throw new HttpException("Envie um arquivo PDF", 400);
			const fileBytes = new Uint8Array(await body.file.arrayBuffer());
			if (fileBytes.length < 5 || new TextDecoder().decode(fileBytes.slice(0, 5)) !== "%PDF-")
				throw new HttpException("Envie um PDF válido", 400);
			const statement = await parseCreditCardStatementPdf(fileBytes.buffer, body.provider, body.password);
			const reportedPreviousBalance =
				statement.reportedPreviousBalance ??
				statement.purchases.find(purchase =>
					/^(saldo\s+(anterior|financiado)|saldo devedor anterior)/i.test(purchase.description.trim()),
				)?.installmentAmount;
			const purchases = assignCreditCardPurchaseExternalIds(
				filterZeroValuePurchases(
					statement.purchases.filter(purchase => statementEntryKind(purchase.description) !== "BALANCE"),
				),
				body.creditCardId,
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
			const existingRoots = new Map(
				existing.flatMap(item => (item.externalId ? [[item.externalId, item.id] as const] : [])),
			);
			const unmatchedFinancings = purchases.filter(
				purchase => purchase.description.startsWith("FIN ") && !existingRoots.has(purchase.externalId),
			);
			if (unmatchedFinancings.length) {
				const candidates = (await readCreditEntries(body.creditCardId)).filter(
					p =>
						!p.parentId &&
						!p.isRefund &&
						unmatchedFinancings.some(f => dateKey(p.purchaseDate) === f.purchaseDate),
				);
				try {
					matchLegacyFinancingRoots(unmatchedFinancings, candidates, existingRoots);
				} catch (error) {
					throw new HttpException(error instanceof Error ? error.message : "Parcelamento ambíguo", 409);
				}
			}
			const existingRootIds = [...new Set(existingRoots.values())];
			const existingInstallments = (await readCreditEntries(body.creditCardId)).filter(p =>
				existingRootIds.includes(p.purchaseId ?? p.id),
			);
			const pendingIds = new Set(pending.map(item => item.externalId));
			const newPurchases = selectNewImportPurchases(
				purchases,
				existingRoots,
				existingInstallments,
				pendingIds,
			);
			const existingCardEntries = await readCreditEntries(body.creditCardId);
			for (const purchase of newPurchases) {
				if (!importedAnticipation(purchase.description) || purchase.reconciledCreditPurchaseId) continue;
				const matches = existingCardEntries.filter(
					entry =>
						!entry.parentId &&
						!entry.isRefund &&
						!entry.isStatementCharge &&
						entry.installments === purchase.installments &&
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
				if (!anticipated || !purchase.reconciledCreditPurchaseId || !statementId) continue;
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
				if (!pending.length)
					await markStatementAsFullySynced({
						creditCardId: body.creditCardId,
						dueDate: new Date(`${statement.dueDate}T12:00:00`),
						statementDate: new Date(`${statement.statementDate}T12:00:00`),
					});
				return { creditCardImport: null, ignoredCount };
			}
			const creditCardImport = await queryFirst(
				db.sql.public.CreditCardImport.insert([
					{
						creditCardId: body.creditCardId,
						dueDate: new Date(`${statement.dueDate}T12:00:00`),
						fileName: body.file.name.slice(0, 255),
						provider: statement.provider,
						reportedPreviousBalance:
							reportedPreviousBalance === undefined ? null : String(reportedPreviousBalance),
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
				]),
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
			try {
				if (Number(current.installmentAmount) > 0)
					getImportedInstallmentAmounts({
						currentInstallment: current.currentInstallment,
						installmentAmount: Number(current.installmentAmount),
						installments,
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
									: preservedDescription,
					installmentAmount: String(current.installmentAmount),
					installments,
					isSelected: body.isSelected ?? current.isSelected,
					isStatementCharge,
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
			const candidates = await getPotentialDuplicates(creditCardImport.creditCardId, [
				{ ...item, reconciledCreditPurchaseId: null },
			]);
			const duplicate = (candidates.get(item.id) ?? []).find(
				candidate => candidate.id === body.creditPurchaseId,
			);
			if (!duplicate)
				throw new HttpException("A compra selecionada não corresponde às parcelas importadas", 409);
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
					categoryId: tagIds[0] ?? null,
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
	})
	.get("/:id/refund-sources", async ({ params, request }) => {
		const userId = await requireUserId(request);
		const imported = await getImport(userId, params.id);
		const book = await readCreditBook(userId, imported.creditCardId);
		return book.purchases.map(p => ({
			description: p.description,
			id: p.id,
			installments: p.installmentAmountsCents.length,
			purchaseDate: p.purchaseDate,
			refundableAmount:
				(p.totalAmountCents -
					book.refunds
						.filter(r => r.purchaseId === p.id && !r.deletedAt)
						.reduce((sum, r) => sum + r.amountCents, 0)) /
				100,
			totalAmount: p.totalAmountCents / 100,
		}));
	})
	.post(
		"/:id/items/:itemId/approve-refund",
		async ({ params, body, request }) => {
			if (Boolean(body.purchaseId) === Boolean(body.purchase))
				throw new HttpException("Vincule ou reconstrua a compra original", 400);
			const userId = await requireUserId(request);
			return withRawTransaction(async query => {
				const imported = await getImport(userId, params.id);
				if (imported.status !== "PENDING") throw new HttpException("Importação já aprovada", 409);
				const [item] = await query<{
					id: string;
					installmentAmount: number;
					purchaseDate: Date;
					externalId: string;
					time: string | null;
				}>(`SELECT * FROM "CreditCardImportItem" WHERE "id"=$1 AND "creditCardImportId"=$2 FOR UPDATE`, [
					params.itemId,
					params.id,
				]);
				if (!item || Number(item.installmentAmount) >= 0)
					throw new HttpException("Reembolso importado não encontrado", 404);
				await mutateCreditBook(userId, imported.creditCardId, book => {
					const p = body.purchaseId
						? book.purchases.find(p => p.id === body.purchaseId)
						: body.purchase
							? newBookPurchase(book, {
									...body.purchase,
									installments: body.purchase.installments,
									storeName: body.purchase.storeName ?? null,
									tagIds: body.purchase.tagIds ?? [],
								})
							: null;
					if (!p) throw new HttpException("Vincule ou revise a compra original", 400);
					const r = addBookRefund(book, p.id, {
						amount: Math.abs(Number(item.installmentAmount)),
						creditDate: dateKey(item.purchaseDate),
						policy: body.policy,
					});
					r.externalId = item.externalId;
					r.time = item.time;
				});
				await cleanupItemTags([item.id]);
				await query(`DELETE FROM "CreditCardImportItem" WHERE "id"=$1`, [item.id]);
				const [{ remaining }] = await query<{ remaining: number }>(
					`SELECT count(*)::int AS remaining FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1`,
					[params.id],
				);
				if (remaining === 0) {
					await query(
						`UPDATE "CreditCardImport" SET "status"='APPROVED', "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
						[params.id],
					);
					await markStatementAsFullySynced(imported);
				}
				return { created: 1, finished: remaining === 0 };
			});
		},
		{
			body: t.Object({
				policy: t.Optional(
					t.Union([t.Literal("KEEP_INSTALLMENTS"), t.Literal("CANCEL_FUTURE_INSTALLMENTS")]),
				),
				purchase: t.Optional(
					t.Object({
						description: t.String({ maxLength: 500, minLength: 1 }),
						installments: t.Integer({ maximum: 48, minimum: 1 }),
						purchaseDate: t.String({ format: "date" }),
						storeName: t.Optional(t.String({ maxLength: 200 })),
						tagIds: t.Optional(t.Array(t.String())),
						totalAmount: t.Number({ exclusiveMinimum: 0 }),
					}),
				),
				purchaseId: t.Optional(t.String()),
			}),
		},
	);
