import { distributePurchaseCents } from "@zaimu/finance/credit-purchase";
import { importedAnticipation } from "@zaimu/finance/imported-anticipation";
import { assertTagOwnership } from "~/modules/categories/application/tag-assignments";
import {
	mutateCreditBook,
	newBookPurchase,
	readCreditBook,
} from "~/modules/creditCards/application/normalized-credit-book";
import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { refundCancellationNumbers } from "../domain/anticipation-refunds";
import { approveImportedRefund } from "../domain/existing-imported-refund";
import { getFinancingSource } from "../domain/financing-source-reference";
import type { RefundImportReviewDTO } from "../infra/elysia/CreditCardImportsDTO";
import {
	approveItems,
	cleanupItemTags,
	combinePendingAnticipationRefunds,
	getImport,
	getPotentialDuplicates,
	markStatementAsFullySynced,
} from "./import-service";

type StoredReview = RefundImportReviewDTO & { sourceExternalId?: string };
type RefundItem = Record<string, unknown> & {
	id: string;
	description: string;
	installmentAmount: number;
	purchaseDate: Date;
	externalId: string;
	time: string | null;
	refundReview: StoredReview | null;
};
type PendingSource = Record<string, unknown> & {
	id: string;
	description: string;
	installmentAmount: number;
	isStatementCharge: boolean;
	externalId: string;
	purchaseDate: Date;
	installments: number;
	totalAmount: number;
	storeName: string | null;
	currentInstallment: number;
	reconciledCreditPurchaseId: string | null;
	metadataMissing: string[];
};

async function pendingSource(importId: string, sourceId: string) {
	const [source] = await queryRaw<PendingSource>(
		`SELECT * FROM "CreditCardImportItem" WHERE "id"=$1 AND "creditCardImportId"=$2`,
		[sourceId, importId],
	);
	if (
		!source ||
		Number(source.installmentAmount) <= 0 ||
		source.isStatementCharge ||
		importedAnticipation(source.description) ||
		getFinancingSource(source.description)
	)
		throw new HttpException("Compra original pendente não encontrada", 409);
	return source;
}

function assertReview(data: RefundImportReviewDTO) {
	if (Boolean(data.purchaseId) === Boolean(data.purchase))
		throw new HttpException("Vincule ou reconstrua a compra original", 400);
	if (
		data.purchase &&
		(!data.purchase.description.trim() ||
			!Number.isFinite(data.purchase.totalAmount) ||
			data.purchase.totalAmount <= 0 ||
			!Number.isInteger(data.purchase.installments) ||
			data.purchase.installments < 1 ||
			data.purchase.installments > 48 ||
			!/^\d{4}-\d{2}-\d{2}$/.test(data.purchase.purchaseDate) ||
			Number.isNaN(Date.parse(data.purchase.purchaseDate)) ||
			new Date(data.purchase.purchaseDate).toISOString().slice(0, 10) !== data.purchase.purchaseDate)
	)
		throw new HttpException("Revise os dados da compra original", 400);
}

async function lockRefund(userId: string, importId: string, itemId: string) {
	await queryRaw(`SELECT "id" FROM "CreditCardImport" WHERE "id"=$1 AND "userId"=$2 FOR UPDATE`, [
		importId,
		userId,
	]);
	const imported = await getImport(userId, importId);
	if (imported.status !== "PENDING") throw new HttpException("Importação já aprovada", 409);
	await combinePendingAnticipationRefunds(userId, importId);
	const [item] = await queryRaw<RefundItem>(
		`SELECT * FROM "CreditCardImportItem" WHERE "id"=$1 AND "creditCardImportId"=$2 FOR UPDATE`,
		[itemId, importId],
	);
	if (!item || Number(item.installmentAmount) >= 0)
		throw new HttpException("Reembolso importado não encontrado", 404);
	return { imported, item };
}

function applyReview(
	book: Awaited<ReturnType<typeof readCreditBook>>,
	item: RefundItem,
	data: StoredReview,
	source?: PendingSource,
) {
	const purchase = source
		? {
				description: source.description,
				installments: source.installments,
				purchaseDate: new Date(source.purchaseDate).toISOString().slice(0, 10),
				storeName: source.storeName,
				tagIds: [],
				totalAmount: Number(source.totalAmount),
			}
		: data.purchase;
	const p = purchase
		? newBookPurchase(book, {
				...purchase,
				storeName: purchase.storeName ?? null,
				tagIds: purchase.tagIds ?? [],
			})
		: book.purchases.find(p => p.id === data.purchaseId);
	if (!p) throw new HttpException("Compra original não encontrada", 409);
	if (source)
		p.installmentAmountsCents = distributePurchaseCents(
			p.totalAmountCents,
			source.installments,
			new Map([[source.currentInstallment, Math.round(Number(source.installmentAmount) * 100)]]),
			book.card.installmentRemainderOnFirst,
		);
	const cancellation = importedAnticipation(item.description);
	if (data.purchase && cancellation)
		p.installmentAmountsCents = distributePurchaseCents(
			p.totalAmountCents,
			p.installmentAmountsCents.length,
			new Map(cancellation.map(part => [part.number, part.amountCents])),
			book.card.installmentRemainderOnFirst,
		);
	const refund = approveImportedRefund(book, p.id, {
		amount: Math.abs(Number(item.installmentAmount)),
		canceledInstallmentNumbers: refundCancellationNumbers(
			item.description,
			Math.round(Math.abs(Number(item.installmentAmount)) * 100),
			p.installmentAmountsCents,
		),
		creditDate: new Date(item.purchaseDate).toISOString().slice(0, 10),
		externalId: item.externalId,
		policy: data.policy,
	});
	refund.time = item.time ?? refund.time;
}

/** Saving previews a detached book; no financial changes or institution policy are persisted. */
export async function saveRefundReview(
	userId: string,
	importId: string,
	itemId: string,
	data: RefundImportReviewDTO,
) {
	assertReview(data);
	return withRawTransaction(async () => {
		const { imported, item } = await lockRefund(userId, importId, itemId);
		const source = data.purchaseId?.startsWith("pending:")
			? await pendingSource(importId, data.purchaseId.slice(8))
			: undefined;
		if (data.purchase) await assertTagOwnership(data.purchase.tagIds ?? [], userId);
		try {
			applyReview(structuredClone(await readCreditBook(userId, imported.creditCardId)), item, data, source);
		} catch (error) {
			if (error instanceof RangeError) throw new HttpException(error.message, 400);
			throw error;
		}
		const stored: StoredReview = { ...data, ...(source && { sourceExternalId: source.externalId }) };
		await queryRaw(
			`UPDATE "CreditCardImportItem" SET "refundReview"=$2::jsonb, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
			[item.id, JSON.stringify(stored)],
		);
		return { refundReview: data };
	});
}

/** Explicit approval revalidates the saved draft under the import and card locks. */
export async function approveReviewedRefund(
	userId: string,
	importId: string,
	itemId: string,
	supplied?: RefundImportReviewDTO,
): Promise<{ created: number; finished: boolean }> {
	return withRawTransaction(async () => {
		const { imported, item } = await lockRefund(userId, importId, itemId);
		const data: StoredReview | null = supplied ?? item.refundReview;
		if (!data) throw new HttpException("Salve a revisão do reembolso antes de aprovar", 409);
		assertReview(data);
		let purchaseId = data.purchaseId;
		if (purchaseId?.startsWith("pending:")) {
			const [source] = await queryRaw<PendingSource>(
				`SELECT * FROM "CreditCardImportItem" WHERE "id"=$1 AND "creditCardImportId"=$2`,
				[purchaseId.slice(8), importId],
			);
			let externalId = data.sourceExternalId;
			if (source) {
				await pendingSource(importId, source.id);
				const duplicates = await getPotentialDuplicates(imported.creditCardId, [source], importId);
				if (duplicates.has(source.id) || source.metadataMissing.length)
					throw new HttpException("Concilie e complete a compra original antes de aprovar", 409);
				externalId = source.externalId;
				await approveItems(userId, importId, source.id);
			}
			const [root] = externalId
				? await queryRaw<{ id: string }>(
						`SELECT p."id" FROM "CreditPurchaseRecord" p LEFT JOIN "CreditPurchaseImportIdentity" i ON i."purchaseId"=p."id" WHERE (p."externalId"=$1 OR i."externalId"=$1) AND p."creditCardId"=$2 LIMIT 1`,
						[externalId, imported.creditCardId],
					)
				: [];
			if (!root) throw new HttpException("Compra original não encontrada", 409);
			purchaseId = root.id;
		}
		if (data.purchase) await assertTagOwnership(data.purchase.tagIds ?? [], userId);
		await mutateCreditBook(userId, imported.creditCardId, book =>
			applyReview(book, item, { ...data, purchaseId }),
		);
		await cleanupItemTags([item.id]);
		await queryRaw(`DELETE FROM "CreditCardImportItem" WHERE "id"=$1`, [item.id]);
		const [{ remaining }] = await queryRaw<{ remaining: number }>(
			`SELECT count(*)::int AS remaining FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1`,
			[importId],
		);
		if (remaining === 0) {
			await queryRaw(
				`UPDATE "CreditCardImport" SET "status"='APPROVED', "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
				[importId],
			);
			await markStatementAsFullySynced(imported);
		}
		return { created: 1, finished: remaining === 0 };
	});
}
