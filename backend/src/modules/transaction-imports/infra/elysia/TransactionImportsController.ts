import Elysia, { t } from "elysia";
import { assertBalanceAccountOwnership, requireUserId } from "~/modules/auth";
import {
	assertTagOwnership,
	getTagsByEntity,
	replaceEntityTags,
	type TagSummary,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { recalculateStatementPayments } from "~/modules/creditCards/application/statement-payments";
import {
	getDebtSplitInput,
	type getDebtSplitReturn,
	getDebtSplitReturns,
	linkTransactionToDebt,
	replaceDebtSplit,
} from "~/modules/debts/application";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { rejectLegacyFinancialFields } from "~/shared/infra/elysia/strict-json-body";
import {
	db,
	executeStatement,
	queryFirst,
	queryRaw,
	queryRows,
	type SqlExecutor,
	withTransaction,
} from "~/shared/infra/sql";
import { filterExistingTransactions } from "../../domain/filter-existing-transactions";
import { filterSynchronizedTransactions } from "../../domain/filter-synchronized-transactions";
import { filterZeroValueTransactions } from "../../domain/filter-zero-value-transactions";
import { matchesDuplicateTransactionShape } from "../../domain/import-reconciliation";
import { assignStableExternalIds } from "../../domain/statement-identity";
import { parseStatementPdf } from "../../domain/statement-parser";
import {
	getTransferSuggestions,
	type TransferSuggestion,
	type TransferSuggestionItem,
	transferSuggestionRejectionKey,
} from "../../domain/transfer-suggestions";
import { TransactionImportItemReconcileDTO, TransactionImportItemUpdateDTO } from "./TransactionImportsDTO";

const importItemTagEntityType = "TRANSACTION_IMPORT_ITEM";
const reconciliationFields = [
	"amount",
	"date",
	"debtSplit",
	"description",
	"destinationFinancialAccountId",
	"originFinancialAccountId",
	"storeName",
	"tagIds",
	"time",
	"type",
] as const;
const transactionTypes = ["INCOME", "EXPENSE", "TRANSFER"] as const;
const importItemTypes = [...transactionTypes, "YIELD"] as const;
type TransactionType = (typeof transactionTypes)[number];
type ImportItemType = (typeof importItemTypes)[number];

const toDateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
const normalizeText = (value: null | string | undefined) => value?.trim() || null;

interface DuplicateCandidate {
	amount: number;
	createdAt: Date;
	paymentCreditCardId: string | null;
	date: Date;
	description: string | null;
	destinationFinancialAccountId: string | null;
	externalIds: string[];
	externalId?: string | null;
	id: string;
	isHidden: boolean;
	originFinancialAccountId: string | null;
	source: "IMPORT_ITEM" | "TRANSACTION";
	sourceImportId: string | null;
	storeName: string | null;
	time: string | null;
	tagIds: string[];
	tags: TagSummary[];
	debtSplit?: Awaited<ReturnType<typeof getDebtSplitReturn>>;
	type: ImportItemType;
}

interface PotentialDuplicates {
	candidates: DuplicateCandidate[];
	reason: "DATE_AMOUNT" | "EXTERNAL_ID";
}

interface TransferSuggestionCandidate extends TransferSuggestionItem {
	createdAt?: Date;
	debtSplit?: Awaited<ReturnType<typeof getDebtSplitReturn>>;
	description: string | null;
	destinationFinancialAccountId?: string | null;
	isHidden?: boolean;
	originFinancialAccountId?: string | null;
	storeName?: string | null;
	tagIds?: string[];
	tags?: TagSummary[];
	time: string | null;
	transactionImportId: string | null;
}

async function getTransferSuggestionPairs(userId: string, itemIds: string[]) {
	const [items, candidates, rejections] = await Promise.all([
		queryRows(
			db.sql.public.TransactionImportItem.innerJoin(db.sql.public.TransactionImport, (fields, functions) =>
				functions.eq(fields.TransactionImportItem.transactionImportId, fields.TransactionImport.id),
			)
				.select(fields => ({
					amount: fields.TransactionImportItem.amount,
					date: fields.TransactionImportItem.date,
					description: fields.TransactionImportItem.description,
					externalId: fields.TransactionImportItem.externalId,
					financialAccountId: fields.TransactionImport.financialAccountId,
					id: fields.TransactionImportItem.id,
					isReconciled: fields.TransactionImportItem.isReconciled,
					time: fields.TransactionImportItem.time,
					transactionImportId: fields.TransactionImportItem.transactionImportId,
					transferCounterpartExternalId: fields.TransactionImportItem.transferCounterpartExternalId,
					type: fields.TransactionImportItem.type,
				}))
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.TransactionImport.userId, userId),
						functions.eq(fields.TransactionImport.status, "PENDING"),
						functions.in(fields.TransactionImportItem.id, itemIds),
					),
				)
				.build(),
		),
		queryRows(
			db.sql.public.TransactionExternalReference.innerJoin(db.sql.public.Transaction, (fields, functions) =>
				functions.eq(fields.TransactionExternalReference.transactionId, fields.Transaction.id),
			)
				.innerJoin(db.sql.public.FinancialAccount, (fields, functions) =>
					functions.eq(fields.TransactionExternalReference.financialAccountId, fields.FinancialAccount.id),
				)
				.select(fields => ({
					amount: fields.Transaction.amount,
					createdAt: fields.Transaction.createdAt,
					date: fields.Transaction.date,
					description: fields.Transaction.description,
					destinationFinancialAccountId: fields.Transaction.destinationFinancialAccountId,
					externalId: fields.TransactionExternalReference.externalId,
					financialAccountId: fields.TransactionExternalReference.financialAccountId,
					id: fields.Transaction.id,
					isHidden: fields.Transaction.isHidden,
					originFinancialAccountId: fields.Transaction.originFinancialAccountId,
					storeName: fields.Transaction.storeName,
					time: fields.Transaction.time,
					type: fields.Transaction.type,
				}))
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.FinancialAccount.userId, userId),
						functions.eq(fields.Transaction.type, "INCOME"),
					),
				)
				.build(),
		),
		queryRows(
			db.sql.public.TransactionImportTransferSuggestionRejection.select(
				"incomingExternalId",
				"incomingFinancialAccountId",
				"outgoingExternalId",
				"outgoingFinancialAccountId",
			)
				.where((fields, functions) => functions.eq(fields.userId, userId))
				.build(),
		),
	]);
	const rejectedPairs = new Set(rejections.map(transferSuggestionRejectionKey));
	const activeItems: TransferSuggestionCandidate[] = items
		.filter(candidate => !candidate.isReconciled)
		.map(({ isReconciled: _, ...candidate }) => ({
			...candidate,
			amount: Number(candidate.amount),
			source: "IMPORT_ITEM" as const,
			type: candidate.type as ImportItemType,
		}));
	const transactionTags = await getTagsByEntity(
		tagEntityType.transaction,
		candidates.map(candidate => candidate.id),
	);
	const candidateDebtSplits = await getDebtSplitReturns(
		"transactionId",
		candidates.map(candidate => ({ amount: Number(candidate.amount), id: candidate.id })),
	);
	const materializedCandidates: TransferSuggestionCandidate[] = candidates.map(candidate => {
		const tags = transactionTags.get(candidate.id) ?? [];
		return {
			...candidate,
			amount: Number(candidate.amount),
			debtSplit: candidateDebtSplits.get(candidate.id) ?? null,
			source: "TRANSACTION" as const,
			tagIds: tags.map(tag => tag.id),
			tags,
			transactionImportId: null,
			type: candidate.type as TransactionType,
		};
	});
	return new Map<string, TransferSuggestion<TransferSuggestionCandidate>[]>(
		itemIds.map(itemId => {
			const item = activeItems.find(candidate => candidate.id === itemId);
			return [itemId, item ? getTransferSuggestions(item, materializedCandidates, rejectedPairs) : []];
		}),
	);
}

async function getImport(userId: string, importId: string) {
	const transactionImport = await queryFirst(
		db.sql.public.TransactionImport.select(
			"id",
			"financialAccountId",
			"provider",
			"status",
			"fileName",
			"periodStart",
			"periodEnd",
			"createdAt",
			"updatedAt",
		)
			.where((fields, functions) =>
				functions.and(functions.eq(fields.id, importId), functions.eq(fields.userId, userId)),
			)
			.limit(1)
			.build(),
	);
	if (!transactionImport) throw new HttpException("Importação não encontrada", 404);
	return transactionImport;
}

async function getPotentialDuplicates(
	financialAccountId: string,
	items: Array<{
		amount: number;
		date: Date;
		destinationFinancialAccountId: string | null;
		externalId: string | null;
		id: string;
		isDuplicateIgnored?: boolean;
		isReconciled?: boolean;
		originFinancialAccountId: string | null;
		type: ImportItemType;
	}>,
) {
	const [transactions, pendingItems] = await Promise.all([
		queryRows(
			db.sql.public.Transaction.select(
				"id",
				"amount",
				"createdAt",
				"paymentCreditCardId",
				"date",
				"description",
				"isHidden",
				"storeName",
				"time",
				"type",
				"originFinancialAccountId",
				"destinationFinancialAccountId",
			)
				.where((fields, functions) =>
					functions.or(
						functions.eq(fields.originFinancialAccountId, financialAccountId),
						functions.eq(fields.destinationFinancialAccountId, financialAccountId),
					),
				)
				.build(),
		),
		queryRows(
			db.sql.public.TransactionImportItem.innerJoin(db.sql.public.TransactionImport, (fields, functions) =>
				functions.eq(fields.TransactionImportItem.transactionImportId, fields.TransactionImport.id),
			)
				.select(fields => ({
					amount: fields.TransactionImportItem.amount,
					createdAt: fields.TransactionImportItem.createdAt,
					date: fields.TransactionImportItem.date,
					description: fields.TransactionImportItem.description,
					destinationFinancialAccountId: fields.TransactionImportItem.destinationFinancialAccountId,
					externalId: fields.TransactionImportItem.externalId,
					id: fields.TransactionImportItem.id,
					isDuplicateIgnored: fields.TransactionImportItem.isDuplicateIgnored,
					isHidden: fields.TransactionImportItem.isHidden,
					isReconciled: fields.TransactionImportItem.isReconciled,
					originFinancialAccountId: fields.TransactionImportItem.originFinancialAccountId,
					paymentCreditCardId: fields.TransactionImportItem.paymentCreditCardId,
					storeName: fields.TransactionImportItem.storeName,
					time: fields.TransactionImportItem.time,
					transactionImportId: fields.TransactionImportItem.transactionImportId,
					type: fields.TransactionImportItem.type,
				}))
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.TransactionImport.status, "PENDING"),
						functions.eq(fields.TransactionImport.financialAccountId, financialAccountId),
					),
				)
				.build(),
		),
	]);

	const [transactionTags, importItemTags, externalReferences] = await Promise.all([
		getTagsByEntity(
			"TRANSACTION",
			transactions.map(transaction => transaction.id),
		),
		getTagsByEntity(
			importItemTagEntityType,
			pendingItems.map(item => item.id),
		),
		queryRows(
			db.sql.public.TransactionExternalReference.select("transactionId", "externalId")
				.where((fields, functions) =>
					functions.in(
						fields.transactionId,
						transactions.map(transaction => transaction.id),
					),
				)
				.build(),
		),
	]);
	const externalIdsByTransaction = new Map<string, string[]>();
	for (const reference of externalReferences) {
		const externalIds = externalIdsByTransaction.get(reference.transactionId) ?? [];
		externalIds.push(reference.externalId);
		externalIdsByTransaction.set(reference.transactionId, externalIds);
	}
	const candidates: DuplicateCandidate[] = [
		...filterSynchronizedTransactions(
			transactions.map(transaction => ({
				...transaction,
				externalIds: externalIdsByTransaction.get(transaction.id) ?? [],
			})),
			transaction => transaction.type === "TRANSFER",
		).map(transaction => {
			const tags = transactionTags.get(transaction.id) ?? [];
			return {
				...transaction,
				source: "TRANSACTION" as const,
				sourceImportId: null,
				tagIds: tags.map(tag => tag.id),
				tags,
				type: transaction.type as TransactionType,
			};
		}),
		...pendingItems
			.filter(item => !item.isReconciled)
			.map(item => {
				const tags = importItemTags.get(item.id) ?? [];
				return {
					...item,
					externalIds: item.externalId ? [item.externalId] : [],
					source: "IMPORT_ITEM" as const,
					sourceImportId: item.transactionImportId,
					tagIds: tags.map(tag => tag.id),
					tags,
					type: item.type as ImportItemType,
				};
			}),
	];
	const [transactionDebtSplits, importItemDebtSplits] = await Promise.all([
		getDebtSplitReturns(
			"transactionId",
			candidates
				.filter(candidate => candidate.source === "TRANSACTION")
				.map(candidate => ({ amount: Number(candidate.amount), id: candidate.id })),
		),
		getDebtSplitReturns(
			"transactionImportItemId",
			candidates
				.filter(candidate => candidate.source === "IMPORT_ITEM")
				.map(candidate => ({ amount: Number(candidate.amount), id: candidate.id })),
		),
	]);
	const candidatesWithDebtSplits = candidates.map(candidate => ({
		...candidate,
		debtSplit:
			(candidate.source === "TRANSACTION" ? transactionDebtSplits : importItemDebtSplits).get(candidate.id) ??
			null,
	}));
	return new Map<string, PotentialDuplicates | null>(
		items.map(item => {
			if (item.isDuplicateIgnored || item.isReconciled) return [item.id, null] as const;
			const isSameAccount = (candidate: {
				destinationFinancialAccountId: string | null;
				originFinancialAccountId: string | null;
			}) =>
				candidate.originFinancialAccountId === financialAccountId ||
				candidate.destinationFinancialAccountId === financialAccountId;
			const externalDuplicates = item.externalId
				? candidatesWithDebtSplits.filter(
						candidate =>
							candidate.id !== item.id &&
							isSameAccount(candidate) &&
							candidate.externalIds.includes(item.externalId!),
					)
				: [];
			const dateAmountDuplicates = candidatesWithDebtSplits.filter(
				candidate =>
					candidate.id !== item.id &&
					isSameAccount(candidate) &&
					matchesDuplicateTransactionShape(item, candidate, financialAccountId) &&
					Number(candidate.amount) === Number(item.amount) &&
					toDateKey(candidate.date) === toDateKey(item.date),
			);
			const hasExternalDuplicates = externalDuplicates.length > 0;
			const duplicateCandidates = hasExternalDuplicates ? externalDuplicates : dateAmountDuplicates;
			return [
				item.id,
				duplicateCandidates.length
					? {
							candidates: duplicateCandidates,
							reason: hasExternalDuplicates ? "EXTERNAL_ID" : "DATE_AMOUNT",
						}
					: null,
			] as const;
		}),
	);
}

interface ImportItemsCursor {
	createdAt: string;
	date: string;
	id: string;
}

const decodeImportItemsCursor = (cursor?: string): ImportItemsCursor | null => {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as ImportItemsCursor;
		if (!parsed.id || Number.isNaN(Date.parse(parsed.createdAt)) || Number.isNaN(Date.parse(parsed.date)))
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
	const transactionImport = await getImport(userId, importId);
	const limit = Math.min(page.limit ?? 50, 100);
	const cursor = decodeImportItemsCursor(page.cursor);
	const itemPage = await queryRaw<{
		[key: string]: unknown;
		createdAt: Date;
		date: Date;
		id: string;
		totalCount: number;
	}>(
		`SELECT "id", "createdAt", "date", count(*) OVER()::integer AS "totalCount"
		 FROM "TransactionImportItem"
		 WHERE "transactionImportId" = $1
		   AND ($2::date IS NULL OR ("date", "createdAt", "id") < ($2::date, $3::timestamp, $4::text))
		 ORDER BY "date" DESC, "createdAt" DESC, "id" DESC
		 LIMIT $5`,
		[importId, cursor?.date ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
	);
	const pageRows = itemPage.slice(0, limit);
	const itemIds = pageRows.map(item => item.id);
	const items = itemIds.length
		? await queryRows(
				db.sql.public.TransactionImportItem.select(
					"id",
					"amount",
					"balanceAfter",
					"paymentCreditCardId",
					"createdAt",
					"date",
					"description",
					"destinationFinancialAccountId",
					"externalId",
					"isDuplicateIgnored",
					"isHidden",
					"isReconciled",
					"isSelected",
					"originFinancialAccountId",
					"storeName",
					"time",
					"transferCounterpartExternalId",
					"type",
					"updatedAt",
				)
					.where((fields, functions) => functions.in(fields.id, itemIds))
					.build(),
			)
		: [];
	const itemOrder = new Map(itemIds.map((id, index) => [id, index]));
	items.sort((left, right) => (itemOrder.get(left.id) ?? 0) - (itemOrder.get(right.id) ?? 0));
	const [tagsByItem, duplicates, transferSuggestions, debtSplitsByItem] = await Promise.all([
		getTagsByEntity(
			importItemTagEntityType,
			items.map(item => item.id),
		),
		getPotentialDuplicates(
			transactionImport.financialAccountId,
			items.map(item => ({ ...item, type: item.type as ImportItemType })),
		),
		getTransferSuggestionPairs(
			userId,
			items.map(item => item.id),
		),
		getDebtSplitReturns(
			"transactionImportItemId",
			items.map(item => ({ amount: Number(item.amount), id: item.id })),
		),
	]);
	const paymentCreditCardIds = items.flatMap(item =>
		item.paymentCreditCardId ? [item.paymentCreditCardId] : [],
	);
	const creditCardStatements = paymentCreditCardIds.length
		? await queryRows(
				db.sql.public.CreditCard.innerJoin(db.sql.public.FinancialAccount, (fields, functions) =>
					functions.eq(fields.CreditCard.financialAccountId, fields.FinancialAccount.id),
				)
					.outerLeftJoin(db.sql.public.FinancialInstitution, (fields, functions) =>
						functions.eq(fields.FinancialAccount.institutionId, fields.FinancialInstitution.id),
					)
					.select((fields, functions) => ({
						creditCardName:
							functions.raw`COALESCE(${fields.FinancialAccount.name}, ${fields.FinancialInstitution.name})`.returns(
								"sql/varchar@1",
							),
						id: fields.CreditCard.id,
						statementDate: functions.raw`NULL::date`.returns("pg/date@1"),
					}))
					.where((fields, functions) =>
						functions.and(
							functions.in(fields.CreditCard.id, paymentCreditCardIds),
							functions.eq(fields.FinancialAccount.userId, userId),
						),
					)
					.build(),
			)
		: [];
	const creditCardStatementsById = new Map(creditCardStatements.map(statement => [statement.id, statement]));
	return {
		...transactionImport,
		hasMore: itemPage.length > limit,
		items: items.map(item => {
			const { externalId: _, transferCounterpartExternalId: __, ...visibleItem } = item;
			const tags = tagsByItem.get(item.id) ?? [];
			const duplicateCandidates = duplicates.get(item.id)?.candidates ?? [];
			const creditCardStatement = item.paymentCreditCardId
				? creditCardStatementsById.get(item.paymentCreditCardId)
				: undefined;
			return {
				...visibleItem,
				creditCardName: creditCardStatement?.creditCardName ?? null,
				creditCardStatementDate: creditCardStatement?.statementDate ?? null,
				debtSplit: debtSplitsByItem.get(item.id) ?? null,
				duplicateReason: duplicates.get(item.id)?.reason ?? null,
				duplicates: duplicateCandidates.map(({ externalIds: _, externalId: __, ...duplicate }) => duplicate),
				tagIds: tags.map(tag => tag.id),
				tags,
				transferSuggestions: (duplicateCandidates.length ? [] : (transferSuggestions.get(item.id) ?? [])).map(
					pair => {
						const counterpart = pair.outgoing.id === item.id ? pair.incoming : pair.outgoing;
						return {
							amount: Number(counterpart.amount),
							createdAt: counterpart.createdAt ?? item.createdAt,
							date: toDateKey(counterpart.date),
							debtSplit: counterpart.debtSplit,
							description: counterpart.description,
							destinationFinancialAccountId: counterpart.destinationFinancialAccountId,
							financialAccountId: counterpart.financialAccountId,
							id: counterpart.id,
							isHidden: counterpart.isHidden ?? false,
							originFinancialAccountId: counterpart.originFinancialAccountId,
							storeName: counterpart.storeName,
							tagIds: counterpart.tagIds ?? [],
							tags: counterpart.tags ?? [],
							time: counterpart.time,
							type: counterpart.type,
						};
					},
				),
			};
		}),
		nextCursor: (() => {
			const last = pageRows.at(-1);
			return itemPage.length > limit && last
				? Buffer.from(
						JSON.stringify({
							createdAt: last.createdAt.toISOString(),
							date: last.date.toISOString(),
							id: last.id,
						}),
					).toString("base64url")
				: null;
		})(),
		pendingItemCount: itemPage[0]?.totalCount ?? 0,
	};
}

async function validateItemAccounts(
	item: {
		destinationFinancialAccountId: string | null;
		originFinancialAccountId: string | null;
		type: ImportItemType;
	},
	userId: string,
) {
	if (item.type === "INCOME" || item.type === "YIELD") {
		if (!item.destinationFinancialAccountId) throw new HttpException("Selecione a conta de destino", 400);
		await assertBalanceAccountOwnership(item.destinationFinancialAccountId, userId);
		return;
	}
	if (!item.originFinancialAccountId) throw new HttpException("Selecione a conta de origem", 400);
	await assertBalanceAccountOwnership(item.originFinancialAccountId, userId, { allowCashback: true });
	if (item.type === "TRANSFER") {
		if (!item.destinationFinancialAccountId) throw new HttpException("Selecione a conta de destino", 400);
		if (item.destinationFinancialAccountId === item.originFinancialAccountId)
			throw new HttpException("Escolha contas diferentes para a transferência", 400);
		await assertBalanceAccountOwnership(item.destinationFinancialAccountId, userId);
	}
}

async function assertCreditCardStatementOwnership(paymentCreditCardId: string, userId: string) {
	const card = await queryFirst(
		db.sql.public.CreditCard.innerJoin(db.sql.public.FinancialAccount, (f, fn) =>
			fn.eq(f.CreditCard.financialAccountId, f.FinancialAccount.id),
		)
			.select(f => ({ id: f.CreditCard.id }))
			.where((f, fn) =>
				fn.and(fn.eq(f.CreditCard.id, paymentCreditCardId), fn.eq(f.FinancialAccount.userId, userId)),
			)
			.build(),
	);
	if (!card) throw new HttpException("Cartão não encontrado", 404);
}

interface ImportItemToApprove {
	amount: number;
	paymentCreditCardId: string | null;
	date: Date;
	description: string | null;
	destinationFinancialAccountId: string | null;
	externalId: string | null;
	id: string;
	isHidden: boolean;
	isReconciled: boolean;
	originFinancialAccountId: string | null;
	reconciledImportItemId: string | null;
	reconciledTransactionId: string | null;
	storeName: string | null;
	time: string | null;
	transferCounterpartExternalId: string | null;
	type: ImportItemType;
}

interface ReconciledImportTarget {
	debtTarget: { transactionId: string } | { transactionImportItemId: string };
	entityId: string;
	entityType: typeof tagEntityType.transaction | typeof importItemTagEntityType;
}

async function prepareImportItem(item: ImportItemToApprove, userId: string) {
	await validateItemAccounts(item, userId);
	if (item.storeName && item.type !== "EXPENSE")
		throw new HttpException("Loja só pode ser informada em saídas", 400);
	if (item.storeName) await resolveStore(userId, item.storeName);
	const tags = await getTagsByEntity(importItemTagEntityType, [item.id]);
	return assertTagOwnership(
		(tags.get(item.id) ?? []).map(tag => tag.id),
		userId,
	);
}

async function persistImportItem(
	transaction: SqlExecutor,
	item: ImportItemToApprove,
	tagIds: string[],
	financialAccountId: string,
	userId: string,
) {
	if (item.type === "YIELD") {
		const existingYield = await transaction.queryFirst(
			transaction.db.sql.public.FinancialAccountYield.select("id")
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.financialAccountId, item.destinationFinancialAccountId!),
						functions.eq(fields.date, item.date),
						functions.eq(fields.kind, "MANUAL"),
					),
				)
				.limit(1)
				.build(),
		);
		const yieldValues = {
			amount: String(item.amount),
			externalId: item.externalId,
			isExcluded: false,
			updatedAt: new Date(),
		};
		if (existingYield)
			await transaction.executeStatement(
				transaction.db.sql.public.FinancialAccountYield.update(yieldValues)
					.where((fields, functions) => functions.eq(fields.id, existingYield.id))
					.build(),
			);
		else
			await transaction.executeStatement(
				transaction.db.sql.public.FinancialAccountYield.insert([
					{
						...yieldValues,
						date: item.date,
						financialAccountId: item.destinationFinancialAccountId!,
						kind: "MANUAL",
					},
				]).build(),
			);
		return null;
	}

	const importedTransaction = await transaction.queryFirst(
		transaction.db.sql.public.Transaction.insert([
			{
				amount: String(item.amount),
				date: item.date,
				description: item.description,
				destinationFinancialAccountId: item.destinationFinancialAccountId,
				isHidden: item.isHidden,
				originFinancialAccountId: item.originFinancialAccountId,
				paymentCreditCardId: item.paymentCreditCardId,
				storeName: item.storeName,
				time: item.time,
				type: item.type as TransactionType,
				userId,
			},
		])
			.returning("id")
			.build(),
	);
	if (!importedTransaction) throw new HttpException("Não foi possível salvar uma transação importada", 500);
	if (item.externalId)
		await transaction.executeStatement(
			transaction.db.sql.public.TransactionExternalReference.insert([
				{
					externalId: item.externalId,
					financialAccountId,
					transactionId: importedTransaction.id,
				},
			]).build(),
		);
	if (item.transferCounterpartExternalId)
		await transaction.executeStatement(
			transaction.db.sql.public.TransactionExternalReference.insert([
				{
					externalId: item.transferCounterpartExternalId,
					financialAccountId: item.destinationFinancialAccountId!,
					transactionId: importedTransaction.id,
				},
			]).build(),
		);
	if (tagIds.length) {
		await transaction.executeStatement(
			transaction.db.sql.public.TagAssignment.insert(
				tagIds.map(categoryId => ({
					categoryId,
					entityId: importedTransaction.id,
					entityType: "TRANSACTION",
				})),
			).build(),
		);
	}
	return importedTransaction.id;
}

async function persistReconciledImportItem(
	transaction: SqlExecutor,
	item: ImportItemToApprove,
	tagIds: string[],
	financialAccountId: string,
): Promise<ReconciledImportTarget> {
	const values = {
		amount: String(item.amount),
		date: item.date,
		description: item.description,
		destinationFinancialAccountId: item.destinationFinancialAccountId,
		isHidden: item.isHidden,
		originFinancialAccountId: item.originFinancialAccountId,
		paymentCreditCardId: item.paymentCreditCardId,
		storeName: item.storeName,
		time: item.time,
		type: item.type as TransactionType,
		updatedAt: new Date(),
	};
	if (item.reconciledTransactionId) {
		const previous = await transaction.queryFirst(
			transaction.db.sql.public.Transaction.select("paymentCreditCardId")
				.where((fields, functions) => functions.eq(fields.id, item.reconciledTransactionId!))
				.limit(1)
				.build(),
		);
		await transaction.executeStatement(
			transaction.db.sql.public.Transaction.update(values)
				.where((fields, functions) => functions.eq(fields.id, item.reconciledTransactionId!))
				.build(),
		);
		if (previous?.paymentCreditCardId && previous.paymentCreditCardId !== item.paymentCreditCardId)
			await recalculateStatementPayments(transaction, [previous.paymentCreditCardId]);
		if (item.externalId)
			await transaction.executeStatement(
				transaction.db.sql.public.TransactionExternalReference.insert([
					{
						externalId: item.externalId,
						financialAccountId,
						transactionId: item.reconciledTransactionId,
					},
				]).build(),
			);
		return {
			debtTarget: { transactionId: item.reconciledTransactionId },
			entityId: item.reconciledTransactionId,
			entityType: tagEntityType.transaction,
		};
	}
	if (!item.reconciledImportItemId) throw new HttpException("Registro conciliado sem destino", 400);
	await transaction.executeStatement(
		transaction.db.sql.public.TransactionImportItem.update({
			...values,
			...(item.externalId && { externalId: item.externalId }),
		})
			.where((fields, functions) => functions.eq(fields.id, item.reconciledImportItemId!))
			.build(),
	);
	return {
		debtTarget: { transactionImportItemId: item.reconciledImportItemId },
		entityId: item.reconciledImportItemId,
		entityType: importItemTagEntityType,
	};
}

async function assertImportItemIsNotReconciliationTarget(itemId: string) {
	if ((await getReconciliationTargetIds([itemId])).size)
		throw new HttpException("Aprove primeiro o item conciliado que atualiza esta transação", 400);
}

async function getReconciliationTargetIds(itemIds: string[]) {
	if (!itemIds.length) return new Set<string>();
	const reconciliations = await queryRows(
		db.sql.public.TransactionImportItem.select("reconciledImportItemId")
			.where((fields, functions) => functions.in(fields.reconciledImportItemId, itemIds))
			.build(),
	);
	return new Set(
		reconciliations.flatMap(item => (item.reconciledImportItemId ? [item.reconciledImportItemId] : [])),
	);
}

async function removeImportItem(transaction: SqlExecutor, itemId: string) {
	await transaction.executeStatement(
		transaction.db.sql.public.TagAssignment.delete()
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.entityType, importItemTagEntityType),
					functions.eq(fields.entityId, itemId),
				),
			)
			.build(),
	);
	await transaction.executeStatement(
		transaction.db.sql.public.TransactionImportItem.delete()
			.where((fields, functions) => functions.eq(fields.id, itemId))
			.build(),
	);
}

async function finalizeImportWhenEmpty(transaction: SqlExecutor, importId: string) {
	const remainingItem = await transaction.queryFirst(
		transaction.db.sql.public.TransactionImportItem.select("id")
			.where((fields, functions) => functions.eq(fields.transactionImportId, importId))
			.limit(1)
			.build(),
	);
	if (remainingItem) return false;
	await transaction.executeStatement(
		transaction.db.sql.public.TransactionImport.update({ status: "APPROVED", updatedAt: new Date() })
			.where((fields, functions) => functions.eq(fields.id, importId))
			.build(),
	);
	return true;
}

export const TransactionImportsController = new Elysia({ prefix: "/transaction-imports" })
	.onTransform(({ body }) => {
		rejectLegacyFinancialFields(body);
	})
	.get("/", async ({ request, set }) => {
		const userId = await requireUserId(request);
		const cached = await distributedCache.remember(
			userId,
			"imports:pending",
			{ domain: "transaction-imports" },
			() =>
				queryRaw<{ id: string; fileName: string; pendingItemCount: number } & Record<string, unknown>>(
					`SELECT import."id", import."fileName", count(item."id")::integer AS "pendingItemCount"
			 FROM "TransactionImport" import
			 LEFT JOIN "TransactionImportItem" item ON item."transactionImportId" = import."id"
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
				{ domain: "transaction-imports", ...query },
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
			await assertBalanceAccountOwnership(body.financialAccountId, userId);
			if (body.file.type !== "application/pdf" && !body.file.name.toLowerCase().endsWith(".pdf"))
				throw new HttpException("Envie um arquivo PDF", 400);
			const fileBytes = new Uint8Array(await body.file.arrayBuffer());
			if (fileBytes.length < 5 || new TextDecoder().decode(fileBytes.slice(0, 5)) !== "%PDF-")
				throw new HttpException("Envie um PDF válido", 400);
			const statement = await parseStatementPdf(fileBytes.buffer, body.provider);
			const statementTransactions = assignStableExternalIds(
				filterZeroValueTransactions(statement.transactions),
				{
					financialAccountId: body.financialAccountId,
					provider: statement.provider,
					userId,
				},
			);
			const [existingTransactions, existingYields, existingManualYields] = await Promise.all([
				queryRows(
					db.sql.public.TransactionExternalReference.select("externalId")
						.where((fields, functions) =>
							functions.and(
								functions.in(
									fields.externalId,
									statementTransactions.map(transaction => transaction.externalId),
								),
								functions.eq(fields.financialAccountId, body.financialAccountId),
							),
						)
						.build(),
				),
				queryRows(
					db.sql.public.FinancialAccountYield.select("externalId")
						.where((fields, functions) =>
							functions.and(
								functions.in(
									fields.externalId,
									statementTransactions.map(transaction => transaction.externalId),
								),
								functions.eq(fields.financialAccountId, body.financialAccountId),
							),
						)
						.build(),
				),
				queryRows(
					db.sql.public.FinancialAccountYield.select("date")
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.financialAccountId, body.financialAccountId),
								functions.eq(fields.kind, "MANUAL"),
							),
						)
						.build(),
				),
			]);
			const existingExternalIds = new Set(
				[...existingTransactions, ...existingYields].flatMap(transaction =>
					transaction.externalId ? [transaction.externalId] : [],
				),
			);
			const existingYieldDates = new Set(
				existingManualYields.map(yieldRecord => toDateKey(yieldRecord.date)),
			);
			const transactions = filterExistingTransactions(
				statementTransactions,
				existingExternalIds,
				existingYieldDates,
			);
			const ignoredCount = statementTransactions.length - transactions.length;
			if (transactions.length === 0) return { ignoredCount, transactionImport: null };
			const transactionImport = await queryFirst(
				db.sql.public.TransactionImport.insert([
					{
						fileName: body.file.name.slice(0, 255),
						financialAccountId: body.financialAccountId,
						periodEnd: statement.periodEnd ? new Date(statement.periodEnd) : undefined,
						periodStart: statement.periodStart ? new Date(statement.periodStart) : undefined,
						provider: statement.provider,
						userId,
					},
				])
					.returning("id")
					.build(),
			);
			if (!transactionImport) throw new HttpException("Não foi possível criar a importação", 500);
			await executeStatement(
				db.sql.public.TransactionImportItem.insert(
					transactions.map(transaction => ({
						amount: String(transaction.amount),
						balanceAfter:
							transaction.balanceAfter === undefined ? undefined : String(transaction.balanceAfter),
						date: new Date(transaction.date),
						description: transaction.description,
						destinationFinancialAccountId:
							transaction.type === "INCOME" || transaction.type === "YIELD"
								? body.financialAccountId
								: undefined,
						externalId: transaction.externalId,
						originFinancialAccountId: transaction.type === "EXPENSE" ? body.financialAccountId : undefined,
						time: transaction.time,
						transactionImportId: transactionImport.id,
						type: transaction.type as ImportItemType,
					})),
				).build(),
			);
			return { ignoredCount, transactionImport: await getImportReturn(userId, transactionImport.id) };
		},
		{
			body: t.Object({
				file: t.File(),
				financialAccountId: t.String({ maxLength: 36, minLength: 1 }),
				provider: t.Union([
					t.Literal("MERCADO_PAGO"),
					t.Literal("NUBANK"),
					t.Literal("BANCO_DO_BRASIL"),
					t.Literal("INTER"),
					t.Literal("PICPAY"),
				]),
			}),
		},
	)
	.patch(
		"/:id/items/:itemId",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const transactionImport = await getImport(userId, params.id);
			if (transactionImport.status !== "PENDING")
				throw new HttpException("Esta importação já foi aprovada", 400);
			const current = await queryFirst(
				db.sql.public.TransactionImportItem.select(
					"id",
					"amount",
					"date",
					"paymentCreditCardId",
					"description",
					"destinationFinancialAccountId",
					"externalId",
					"isDuplicateIgnored",
					"transferCounterpartExternalId",
					"isHidden",
					"isSelected",
					"originFinancialAccountId",
					"storeName",
					"time",
					"type",
				)
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.id, params.itemId),
							functions.eq(fields.transactionImportId, transactionImport.id),
						),
					)
					.limit(1)
					.build(),
			);
			if (!current) throw new HttpException("Item da importação não encontrado", 404);
			const type = (body.type ?? current.type) as ImportItemType;
			const next = {
				amount: body.amount ?? Number(current.amount),
				date: body.date ?? toDateKey(current.date),
				description: body.description === undefined ? current.description : normalizeText(body.description),
				destinationFinancialAccountId:
					body.destinationFinancialAccountId === undefined
						? current.destinationFinancialAccountId
						: body.destinationFinancialAccountId,
				externalId: current.externalId,
				isDuplicateIgnored: body.isDuplicateIgnored ?? current.isDuplicateIgnored,
				isHidden: body.isHidden ?? current.isHidden,
				isSelected: body.isSelected ?? current.isSelected,
				originFinancialAccountId:
					body.originFinancialAccountId === undefined
						? current.originFinancialAccountId
						: body.originFinancialAccountId,
				paymentCreditCardId:
					type === "EXPENSE"
						? body.paymentCreditCardId === undefined
							? current.paymentCreditCardId
							: body.paymentCreditCardId
						: null,
				storeName: body.storeName === undefined ? current.storeName : normalizeText(body.storeName),
				time: body.time === undefined ? current.time : body.time,
				transferCounterpartExternalId: current.transferCounterpartExternalId,
				type,
			};
			if (
				current.transferCounterpartExternalId &&
				(body.type !== undefined ||
					body.destinationFinancialAccountId !== undefined ||
					body.originFinancialAccountId !== undefined)
			)
				throw new HttpException("A transferência combinada não pode mudar de contas ou tipo", 400);
			if (body.debtSplit !== undefined && body.debtSplit !== null && type === "TRANSFER")
				throw new HttpException("Transferências não podem ser vinculadas a dívidas", 400);
			await validateItemAccounts(next, userId);
			if (next.paymentCreditCardId)
				await assertCreditCardStatementOwnership(next.paymentCreditCardId, userId);
			if (next.storeName && next.type !== "EXPENSE")
				throw new HttpException("Loja só pode ser informada em saídas", 400);
			if (next.storeName) await resolveStore(userId, next.storeName);
			const tagIds = body.tagIds === undefined ? undefined : await assertTagOwnership(body.tagIds, userId);
			await executeStatement(
				db.sql.public.TransactionImportItem.update({
					...next,
					amount: String(next.amount),
					date: new Date(next.date),
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, current.id))
					.build(),
			);
			if (tagIds)
				await replaceEntityTags({ entityIds: [current.id], entityType: importItemTagEntityType, tagIds });
			if (body.debtSplit !== undefined)
				await replaceDebtSplit({
					amount: next.amount,
					split: body.debtSplit,
					target: { transactionImportItemId: current.id },
					userId,
				});
			return getImportReturn(userId, transactionImport.id);
		},
		{ body: TransactionImportItemUpdateDTO, params: t.Object({ id: t.String(), itemId: t.String() }) },
	)
	.post(
		"/:id/items/:itemId/transfer-suggestions/:counterpartItemId/accept",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const transactionImport = await getImport(userId, params.id);
			if (transactionImport.status !== "PENDING")
				throw new HttpException("Esta importação já foi aprovada", 400);
			const pairs = await getTransferSuggestionPairs(userId, [params.itemId]);
			const pair = (pairs.get(params.itemId) ?? []).find(
				candidate =>
					candidate.outgoing.id === params.counterpartItemId ||
					candidate.incoming.id === params.counterpartItemId,
			);
			const requestedItem = pair?.outgoing.id === params.itemId ? pair.outgoing : pair?.incoming;
			if (
				!pair ||
				!requestedItem ||
				requestedItem.transactionImportId !== transactionImport.id ||
				pair.incoming.source !== "TRANSACTION"
			)
				throw new HttpException("Sugestão de transferência não encontrada", 404);
			const debtSplits = await queryRows(
				db.sql.public.DebtSplit.select("id")
					.where((fields, functions) =>
						functions.or(
							functions.eq(fields.transactionImportItemId, pair.outgoing.id),
							functions.eq(fields.transactionId, pair.incoming.id),
						),
					)
					.build(),
			);
			if (debtSplits.length)
				throw new HttpException("Remova o rateio de dívida antes de combinar a transferência", 400);
			await withTransaction(async transaction => {
				await transaction.executeStatement(
					transaction.db.sql.public.Transaction.update({
						destinationFinancialAccountId: pair.incoming.financialAccountId,
						originFinancialAccountId: pair.outgoing.financialAccountId,
						paymentCreditCardId: null,
						storeName: null,
						type: "TRANSFER",
						updatedAt: new Date(),
					})
						.where((fields, functions) => functions.eq(fields.id, pair.incoming.id))
						.build(),
				);
				await transaction.executeStatement(
					transaction.db.sql.public.TransactionExternalReference.insert([
						{
							externalId: pair.outgoing.externalId!,
							financialAccountId: pair.outgoing.financialAccountId,
							transactionId: pair.incoming.id,
						},
					]).build(),
				);
				await transaction.executeStatement(
					transaction.db.sql.public.TagAssignment.delete()
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.entityType, tagEntityType.transaction),
								functions.eq(fields.entityId, pair.incoming.id),
							),
						)
						.build(),
				);
				await removeImportItem(transaction, pair.outgoing.id);
				await finalizeImportWhenEmpty(transaction, transactionImport.id);
			});
			return { removedImportId: transactionImport.id, success: true };
		},
		{ params: t.Object({ counterpartItemId: t.String(), id: t.String(), itemId: t.String() }) },
	)
	.post(
		"/:id/items/:itemId/transfer-suggestions/:counterpartItemId/reject",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const transactionImport = await getImport(userId, params.id);
			if (transactionImport.status !== "PENDING")
				throw new HttpException("Esta importação já foi aprovada", 400);
			const pairs = await getTransferSuggestionPairs(userId, [params.itemId]);
			const pair = (pairs.get(params.itemId) ?? []).find(
				candidate =>
					candidate.outgoing.id === params.counterpartItemId ||
					candidate.incoming.id === params.counterpartItemId,
			);
			const requestedItem = pair?.outgoing.id === params.itemId ? pair.outgoing : pair?.incoming;
			if (
				!pair ||
				!requestedItem ||
				requestedItem.transactionImportId !== transactionImport.id ||
				pair.incoming.source !== "TRANSACTION" ||
				!pair.outgoing.externalId ||
				!pair.incoming.externalId
			)
				throw new HttpException("Sugestão de transferência não encontrada", 404);
			await executeStatement(
				db.sql.public.TransactionImportTransferSuggestionRejection.insert([
					{
						incomingExternalId: pair.incoming.externalId,
						incomingFinancialAccountId: pair.incoming.financialAccountId,
						outgoingExternalId: pair.outgoing.externalId,
						outgoingFinancialAccountId: pair.outgoing.financialAccountId,
						userId,
					},
				]).build(),
			);
			return { success: true };
		},
		{ params: t.Object({ counterpartItemId: t.String(), id: t.String(), itemId: t.String() }) },
	)
	.post(
		"/:id/items/:itemId/approve",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const transactionImport = await getImport(userId, params.id);
			if (transactionImport.status !== "PENDING")
				throw new HttpException("Esta importação já foi aprovada", 400);
			const item = await queryFirst(
				db.sql.public.TransactionImportItem.select(
					"id",
					"amount",
					"paymentCreditCardId",
					"date",
					"description",
					"destinationFinancialAccountId",
					"externalId",
					"isDuplicateIgnored",
					"transferCounterpartExternalId",
					"isHidden",
					"isReconciled",
					"originFinancialAccountId",
					"reconciledImportItemId",
					"reconciledTransactionId",
					"storeName",
					"time",
					"type",
				)
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.id, params.itemId),
							functions.eq(fields.transactionImportId, transactionImport.id),
						),
					)
					.limit(1)
					.build(),
			);
			if (!item) throw new HttpException("Item da importação não encontrado", 404);
			await assertImportItemIsNotReconciliationTarget(item.id);
			const importItem = { ...item, type: item.type as ImportItemType };
			const duplicates = await getPotentialDuplicates(transactionImport.financialAccountId, [importItem]);
			if (duplicates.get(item.id))
				throw new HttpException("Resolva a possível duplicata antes de aprovar", 400);
			const tagIds = await prepareImportItem(importItem, userId);
			const debtSplit = await getDebtSplitInput({ transactionImportItemId: importItem.id });
			const result = await withTransaction(async transaction => {
				const reconciledTarget = importItem.isReconciled
					? await persistReconciledImportItem(
							transaction,
							importItem,
							tagIds,
							transactionImport.financialAccountId,
						)
					: null;
				const transactionId = reconciledTarget
					? null
					: await persistImportItem(
							transaction,
							importItem,
							tagIds,
							transactionImport.financialAccountId,
							userId,
						);
				await removeImportItem(transaction, item.id);
				if (importItem.paymentCreditCardId)
					await recalculateStatementPayments(transaction, [importItem.paymentCreditCardId]);
				const finished = await finalizeImportWhenEmpty(transaction, transactionImport.id);
				return { finished, reconciledTarget, transactionId };
			});
			if (result.reconciledTarget) {
				await replaceEntityTags({
					entityIds: [result.reconciledTarget.entityId],
					entityType: result.reconciledTarget.entityType,
					tagIds,
				});
				await replaceDebtSplit({
					amount: importItem.amount,
					split: debtSplit ?? null,
					target: result.reconciledTarget.debtTarget,
					userId,
				});
			} else if (debtSplit && result.transactionId)
				await linkTransactionToDebt({
					amount: importItem.amount,
					date: toDateKey(importItem.date),
					debtSplit,
					description: importItem.description ?? undefined,
					transactionId: result.transactionId,
					type: importItem.type as TransactionType,
					userId,
				});
			return { created: 1, finished: result.finished };
		},
		{ params: t.Object({ id: t.String(), itemId: t.String() }) },
	)
	.post(
		"/:id/days/:date/approve",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const transactionImport = await getImport(userId, params.id);
			if (transactionImport.status !== "PENDING")
				throw new HttpException("Esta importação já foi aprovada", 400);
			const items = await queryRows(
				db.sql.public.TransactionImportItem.select(
					"id",
					"amount",
					"paymentCreditCardId",
					"date",
					"description",
					"destinationFinancialAccountId",
					"externalId",
					"isDuplicateIgnored",
					"transferCounterpartExternalId",
					"isHidden",
					"isReconciled",
					"originFinancialAccountId",
					"reconciledImportItemId",
					"reconciledTransactionId",
					"storeName",
					"time",
					"type",
				)
					.where((fields, functions) => functions.eq(fields.transactionImportId, transactionImport.id))
					.build(),
			);
			const itemsForDay = items
				.filter(item => toDateKey(item.date) === params.date)
				.map(item => ({ ...item, type: item.type as ImportItemType }));
			const duplicates = await getPotentialDuplicates(transactionImport.financialAccountId, itemsForDay);
			const reconciliationTargetIds = await getReconciliationTargetIds(itemsForDay.map(item => item.id));
			const approvableItems = itemsForDay.filter(
				item => !duplicates.get(item.id) && !reconciliationTargetIds.has(item.id),
			);
			if (!approvableItems.length)
				throw new HttpException("Não há transações sem pendências para aprovar neste dia", 400);
			const tagIdsByItem = new Map<string, string[]>();
			const debtSplitsByItem = new Map<string, Awaited<ReturnType<typeof getDebtSplitInput>>>();
			for (const item of approvableItems) {
				tagIdsByItem.set(item.id, await prepareImportItem(item, userId));
				debtSplitsByItem.set(item.id, await getDebtSplitInput({ transactionImportItemId: item.id }));
			}
			const importedTransactions = await withTransaction(async transaction => {
				const results: Array<{
					item: ImportItemToApprove;
					reconciledTarget: ReconciledImportTarget | null;
					transactionId: string | null;
				}> = [];
				for (const item of approvableItems) {
					const reconciledTarget = item.isReconciled
						? await persistReconciledImportItem(
								transaction,
								item,
								tagIdsByItem.get(item.id) ?? [],
								transactionImport.financialAccountId,
							)
						: null;
					const transactionId = reconciledTarget
						? null
						: await persistImportItem(
								transaction,
								item,
								tagIdsByItem.get(item.id) ?? [],
								transactionImport.financialAccountId,
								userId,
							);
					await removeImportItem(transaction, item.id);
					results.push({ item, reconciledTarget, transactionId });
				}
				await recalculateStatementPayments(transaction, [
					...new Set(
						approvableItems.flatMap(item => (item.paymentCreditCardId ? [item.paymentCreditCardId] : [])),
					),
				]);
				const finished = await finalizeImportWhenEmpty(transaction, transactionImport.id);
				return { finished, results };
			});
			for (const { item, reconciledTarget, transactionId } of importedTransactions.results) {
				const debtSplit = debtSplitsByItem.get(item.id);
				if (reconciledTarget) {
					await replaceEntityTags({
						entityIds: [reconciledTarget.entityId],
						entityType: reconciledTarget.entityType,
						tagIds: tagIdsByItem.get(item.id) ?? [],
					});
					await replaceDebtSplit({
						amount: item.amount,
						split: debtSplit ?? null,
						target: reconciledTarget.debtTarget,
						userId,
					});
				} else if (debtSplit && transactionId)
					await linkTransactionToDebt({
						amount: item.amount,
						date: toDateKey(item.date),
						debtSplit,
						description: item.description ?? undefined,
						transactionId,
						type: item.type as TransactionType,
						userId,
					});
			}
			return { created: approvableItems.length, finished: importedTransactions.finished };
		},
		{
			params: t.Object({
				date: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
				id: t.String(),
			}),
		},
	)
	.post(
		"/:id/items/:itemId/reconcile",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const transactionImport = await getImport(userId, params.id);
			if (transactionImport.status !== "PENDING")
				throw new HttpException("Esta importação já foi aprovada", 400);
			const [item] = await queryRows(
				db.sql.public.TransactionImportItem.select(
					"id",
					"amount",
					"paymentCreditCardId",
					"date",
					"description",
					"destinationFinancialAccountId",
					"externalId",
					"isDuplicateIgnored",
					"isHidden",
					"originFinancialAccountId",
					"storeName",
					"time",
					"type",
				)
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.id, params.itemId),
							functions.eq(fields.transactionImportId, transactionImport.id),
						),
					)
					.limit(1)
					.build(),
			);
			if (!item) throw new HttpException("Item da importação não encontrado", 404);
			const duplicates = await getPotentialDuplicates(transactionImport.financialAccountId, [
				{ ...item, type: item.type as ImportItemType },
			]);
			const duplicate = duplicates
				.get(item.id)
				?.candidates.find(
					candidate => candidate.id === body.duplicateId && candidate.source === body.duplicateSource,
				);
			if (!duplicate || duplicate.id !== body.duplicateId || duplicate.source !== body.duplicateSource)
				throw new HttpException("Duplicata não encontrada", 404);
			const itemTags = await getTagsByEntity(importItemTagEntityType, [item.id]);
			const source = <T>(field: (typeof reconciliationFields)[number], imported: T, existing: T) =>
				body.sources[field] === "duplicate" ? existing : imported;
			const type = source("type", item.type as ImportItemType, duplicate.type);
			const values = {
				amount: source("amount", item.amount, duplicate.amount),
				date: source("date", item.date, duplicate.date),
				description: source("description", item.description, duplicate.description),
				destinationFinancialAccountId: source(
					"destinationFinancialAccountId",
					item.destinationFinancialAccountId,
					duplicate.destinationFinancialAccountId,
				),
				isHidden: item.isHidden,
				originFinancialAccountId: source(
					"originFinancialAccountId",
					item.originFinancialAccountId,
					duplicate.originFinancialAccountId,
				),
				paymentCreditCardId: type === "EXPENSE" ? duplicate.paymentCreditCardId : null,
				storeName: source("storeName", item.storeName, duplicate.storeName),
				time: source("time", item.time, duplicate.time),
				type,
			};
			await validateItemAccounts(values, userId);
			if (values.storeName && values.type !== "EXPENSE")
				throw new HttpException("Loja só pode ser informada em saídas", 400);
			if (values.storeName) await resolveStore(userId, values.storeName);
			const tagIds = await assertTagOwnership(
				source(
					"tagIds",
					(itemTags.get(item.id) ?? []).map(tag => tag.id),
					duplicate.tagIds,
				),
				userId,
			);
			if (values.paymentCreditCardId)
				await assertCreditCardStatementOwnership(values.paymentCreditCardId, userId);
			const duplicateDebtTarget =
				duplicate.source === "TRANSACTION"
					? {
							transactionId: duplicate.id,
						}
					: {
							transactionImportItemId: duplicate.id,
						};
			const debtSplit =
				body.sources.debtSplit === "duplicate"
					? await getDebtSplitInput(duplicateDebtTarget)
					: await getDebtSplitInput({ transactionImportItemId: item.id });
			await withTransaction(async transaction => {
				await transaction.executeStatement(
					transaction.db.sql.public.TransactionImportItem.update({
						...values,
						amount: String(values.amount),
						date: new Date(values.date),
						isReconciled: true,
						reconciledImportItemId: duplicate.source === "IMPORT_ITEM" ? duplicate.id : null,
						reconciledTransactionId: duplicate.source === "TRANSACTION" ? duplicate.id : null,
						updatedAt: new Date(),
					})
						.where((fields, functions) => functions.eq(fields.id, item.id))
						.build(),
				);
			});
			await replaceEntityTags({
				entityIds: [item.id],
				entityType: importItemTagEntityType,
				tagIds,
			});
			await replaceDebtSplit({
				amount: Number(values.amount),
				split: debtSplit ?? null,
				target: { transactionImportItemId: item.id },
				userId,
			});
			return getImportReturn(userId, transactionImport.id);
		},
		{
			body: TransactionImportItemReconcileDTO,
			params: t.Object({ id: t.String(), itemId: t.String() }),
		},
	)
	.post(
		"/:id/approve",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const transactionImport = await getImport(userId, params.id);
			if (transactionImport.status !== "PENDING")
				throw new HttpException("Esta importação já foi aprovada", 400);
			const items = (
				await queryRows(
					db.sql.public.TransactionImportItem.select(
						"id",
						"amount",
						"paymentCreditCardId",
						"date",
						"description",
						"destinationFinancialAccountId",
						"externalId",
						"transferCounterpartExternalId",
						"isHidden",
						"isReconciled",
						"originFinancialAccountId",
						"reconciledImportItemId",
						"reconciledTransactionId",
						"storeName",
						"time",
						"type",
					)
						.where((fields, functions) => functions.eq(fields.transactionImportId, transactionImport.id))
						.build(),
				)
			).map(item => ({ ...item, type: item.type as ImportItemType }));
			const duplicates = await getPotentialDuplicates(transactionImport.financialAccountId, items);
			const reconciliationTargetIds = await getReconciliationTargetIds(items.map(item => item.id));
			const approvableItems = items.filter(
				item => !duplicates.get(item.id) && !reconciliationTargetIds.has(item.id),
			);
			const tagIdsByItem = new Map<string, string[]>();
			const debtSplitsByItem = new Map<string, Awaited<ReturnType<typeof getDebtSplitInput>>>();
			for (const item of approvableItems) {
				tagIdsByItem.set(item.id, await prepareImportItem(item, userId));
				debtSplitsByItem.set(item.id, await getDebtSplitInput({ transactionImportItemId: item.id }));
			}
			const importedTransactions = await withTransaction(async transaction => {
				const results: Array<{
					item: ImportItemToApprove;
					reconciledTarget: ReconciledImportTarget | null;
					transactionId: string | null;
				}> = [];
				for (const item of approvableItems) {
					const reconciledTarget = item.isReconciled
						? await persistReconciledImportItem(
								transaction,
								item,
								tagIdsByItem.get(item.id) ?? [],
								transactionImport.financialAccountId,
							)
						: null;
					const transactionId = reconciledTarget
						? null
						: await persistImportItem(
								transaction,
								item,
								tagIdsByItem.get(item.id) ?? [],
								transactionImport.financialAccountId,
								userId,
							);
					await removeImportItem(transaction, item.id);
					results.push({ item, reconciledTarget, transactionId });
				}
				await recalculateStatementPayments(transaction, [
					...new Set(
						approvableItems.flatMap(item => (item.paymentCreditCardId ? [item.paymentCreditCardId] : [])),
					),
				]);
				const finished = await finalizeImportWhenEmpty(transaction, transactionImport.id);
				return { finished, results };
			});
			for (const { item, reconciledTarget, transactionId } of importedTransactions.results) {
				const debtSplit = debtSplitsByItem.get(item.id);
				if (reconciledTarget) {
					await replaceEntityTags({
						entityIds: [reconciledTarget.entityId],
						entityType: reconciledTarget.entityType,
						tagIds: tagIdsByItem.get(item.id) ?? [],
					});
					await replaceDebtSplit({
						amount: item.amount,
						split: debtSplit ?? null,
						target: reconciledTarget.debtTarget,
						userId,
					});
				} else if (debtSplit && transactionId)
					await linkTransactionToDebt({
						amount: item.amount,
						date: toDateKey(item.date),
						debtSplit,
						description: item.description ?? undefined,
						transactionId,
						type: item.type as TransactionType,
						userId,
					});
			}
			return { created: approvableItems.length, finished: importedTransactions.finished };
		},
		{ params: t.Object({ id: t.String() }) },
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const transactionImport = await getImport(userId, params.id);
			if (transactionImport.status !== "PENDING")
				throw new HttpException("Importações aprovadas não podem ser descartadas", 400);
			await executeStatement(
				db.sql.public.TransactionImport.delete()
					.where((fields, functions) => functions.eq(fields.id, transactionImport.id))
					.build(),
			);
			return { success: true };
		},
		{ params: t.Object({ id: t.String() }) },
	);
