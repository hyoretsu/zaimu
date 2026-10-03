import { ensureBookStatement } from "@zaimu/finance/credit-book";
import { getTagsByEntity } from "~/modules/categories/application/tag-assignments";
import { materializeImportedPurchase } from "~/modules/credit-card-imports/application/materialize-imported-purchase";
import { mutateCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { recalculateStatementPayments } from "~/modules/creditCards/application/statement-payments";
import { getDebtSplitInput, replaceDebtSplit } from "~/modules/debts/application";
import {
	createCreditCardBatch,
	createTransactionBatch,
} from "~/modules/transaction-imports/application/import-batches";
import {
	type ImportItemToApprove,
	persistImportItem,
	persistReconciledImportItem,
} from "~/modules/transaction-imports/application/import-service";
import { HttpException } from "~/shared/errors";
import { executeRaw, queryRaw, withTransaction } from "~/shared/infra/sql";
import { externalReference, type NormalizedRecord } from "../domain/normalize";
import { type Binding, findCandidates } from "./candidates";
import { type LocalKind, localSnapshot, sameSnapshot } from "./local-snapshot";
import { refreshUntouchedReview, reviewSnapshot } from "./review-snapshot";

interface ExternalRecord extends Record<string, unknown> {
	id: string;
	snapshot: NormalizedRecord;
	appliedSnapshot: Record<string, unknown> | null;
	localKind: LocalKind | null;
	localId: string | null;
	importId: string | null;
	reviewItemId: string | null;
	state: string;
}
export type ProcessOutcome = "imported" | "linked" | "pending" | "unchanged";
const dateObject = (date: string) => new Date(`${date}T00:00:00Z`);
function transactionInput(
	binding: Binding,
	remote: NormalizedRecord,
	externalId: string,
): ImportItemToApprove {
	return {
		amount: Math.abs(remote.amount),
		date: dateObject(remote.date),
		description: remote.description,
		destinationFinancialAccountId: remote.amount >= 0 ? binding.financialAccountId : null,
		externalId,
		id: crypto.randomUUID(),
		isHidden: false,
		isReconciled: false,
		originFinancialAccountId: remote.amount < 0 ? binding.financialAccountId : null,
		paymentCreditCardId: null,
		reconciledImportItemId: null,
		reconciledTransactionId: null,
		storeName: null,
		time: remote.time,
		transferCounterpartExternalId: null,
		type: remote.amount < 0 ? "EXPENSE" : "INCOME",
	};
}
async function addAliases(userId: string, accountId: string, recordId: string, aliases: string[]) {
	for (const alias of aliases) {
		await executeRaw(
			`INSERT INTO "OpenFinanceIdentity" ("userId", "remoteAccountId", "externalId", "recordId") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
			[userId, accountId, alias, recordId],
		);
		const [existing] = await queryRaw<{ recordId: string }>(
			'SELECT "recordId" FROM "OpenFinanceIdentity" WHERE "userId"=$1 AND "remoteAccountId"=$2 AND "externalId"=$3',
			[userId, accountId, alias],
		);
		if (existing?.recordId !== recordId) throw new Error("Conflito de identidade bancária");
	}
}
async function bindLocal(
	recordId: string,
	userId: string,
	binding: Binding,
	remote: NormalizedRecord,
	kind: LocalKind,
	localId: string,
) {
	if (kind === "TRANSACTION") {
		for (const alias of remote.aliases)
			await executeRaw(
				`INSERT INTO "TransactionExternalReference" ("id", "transactionId", "financialAccountId", "externalId") VALUES ($1,$2,$3,$4) ON CONFLICT ("financialAccountId", "externalId") DO NOTHING`,
				[
					crypto.randomUUID(),
					localId,
					binding.financialAccountId,
					externalReference(userId, binding.remoteAccountId, alias),
				],
			);
	}
	const applied = await localSnapshot(kind, localId, userId);
	await executeRaw(
		`UPDATE "OpenFinanceRecord" SET "state"='APPLIED', "localKind"=$2, "localId"=$3, "appliedSnapshot"=$4::jsonb, "reviewItemId"=NULL, "importId"=NULL, "updatedAt"=now() WHERE "id"=$1`,
		[recordId, kind, localId, JSON.stringify(applied)],
	);
}
async function createReview(
	userId: string,
	binding: Binding,
	record: ExternalRecord,
	remote: NormalizedRecord,
) {
	const itemId = crypto.randomUUID();
	const reference = externalReference(userId, binding.remoteAccountId, remote.identity);
	let importId: string;
	if (binding.creditCardId) {
		// Missing calendar is visibly marked; these placeholders cannot pass approval until resolved.
		const batch = await createCreditCardBatch({
			creditCardId: binding.creditCardId,
			dueDate: dateObject(remote.dueDate ?? remote.date),
			fileName: "MeuPluggy - revisão",
			provider: "MEUPLUGGY",
			statementDate: dateObject(remote.statementDate ?? remote.date),
			userId,
		});
		importId = batch.id;
		await executeRaw(
			`INSERT INTO "CreditCardImportItem" ("id", "creditCardImportId", "externalId", "purchaseDate", "time", "description", "totalAmount", "installments", "currentInstallment", "installmentAmount", "isStatementCharge", "metadataMissing") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
			[
				itemId,
				importId,
				reference,
				remote.date,
				remote.time,
				remote.description.slice(0, 500),
				remote.totalAmount ?? 0,
				Math.max(1, remote.installments),
				Math.max(1, remote.installmentNumber),
				remote.amount,
				remote.operation === "CHARGE",
				JSON.stringify(remote.incomplete),
			],
		);
	} else {
		const batch = await createTransactionBatch({
			fileName: "MeuPluggy - revisão",
			financialAccountId: binding.financialAccountId!,
			provider: "MEUPLUGGY",
			userId,
		});
		importId = batch.id;
		const item = transactionInput(binding, remote, reference);
		await executeRaw(
			`INSERT INTO "TransactionImportItem" ("id", "transactionImportId", "externalId", "amount", "date", "time", "description", "type", "originFinancialAccountId", "destinationFinancialAccountId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			[
				itemId,
				importId,
				reference,
				item.amount,
				remote.date,
				remote.time,
				remote.description.slice(0, 1000),
				item.type,
				item.originFinancialAccountId,
				item.destinationFinancialAccountId,
			],
		);
	}
	await executeRaw(
		`UPDATE "OpenFinanceRecord" SET "state"='REVIEW', "reviewItemId"=$2, "importId"=$3, "appliedSnapshot"=$4::jsonb, "updatedAt"=now() WHERE "id"=$1`,
		[
			record.id,
			itemId,
			importId,
			JSON.stringify(await reviewSnapshot(itemId, Boolean(binding.creditCardId))),
		],
	);
	return "pending" as const;
}
async function applyRemote(
	userId: string,
	binding: Binding,
	remote: NormalizedRecord,
	localId?: string | null,
	correcting = false,
) {
	const reference = externalReference(userId, binding.remoteAccountId, remote.identity);
	if (!binding.creditCardId) {
		const input = transactionInput(binding, remote, reference);
		if (localId) {
			const tags = await getTagsByEntity("TRANSACTION", [localId]);
			const split = await getDebtSplitInput({ transactionId: localId });
			const [old] = await queryRaw<{
				isHidden: boolean;
				storeName: string | null;
				paymentCreditCardId: string | null;
			}>(
				'SELECT "isHidden", "storeName", "paymentCreditCardId" FROM "Transaction" WHERE "id"=$1 AND "userId"=$2',
				[localId, userId],
			);
			await withTransaction(tx =>
				persistReconciledImportItem(
					tx,
					{
						...input,
						externalId: null,
						isHidden: old?.isHidden ?? false,
						paymentCreditCardId: old?.paymentCreditCardId ?? null,
						reconciledTransactionId: localId,
						storeName: old?.storeName ?? null,
					},
					(tags.get(localId) ?? []).map(t => t.id),
					binding.financialAccountId!,
				),
			);
			if (old?.paymentCreditCardId)
				await withTransaction(tx => recalculateStatementPayments(tx, [old.paymentCreditCardId!]));
			if (split)
				await replaceDebtSplit({ amount: input.amount, split, target: { transactionId: localId }, userId });
			return { id: localId, kind: "TRANSACTION" as const };
		}
		const id = await withTransaction(tx =>
			persistImportItem(tx, input, [], binding.financialAccountId!, userId),
		);
		return { id: id!, kind: "TRANSACTION" as const };
	}
	const [card] = await queryRaw<Parameters<typeof materializeImportedPurchase>[0] & Record<string, unknown>>(
		`SELECT c.*, a."userId" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE c."id"=$1 AND a."userId"=$2`,
		[binding.creditCardId, userId],
	);
	if (!card) throw new Error("Vínculo incompatível");
	if (localId && remote.operation === "CHARGE") {
		await mutateCreditBook(userId, binding.creditCardId, book => {
			const charge = book.charges.find(c => c.id === localId);
			if (!charge) throw new Error("Encargo não encontrado");
			charge.statementId = ensureBookStatement(book, remote.date, {
				dueDate: remote.dueDate!,
				statementDate: remote.statementDate!,
			}).id;
			charge.amountCents = Math.round(remote.amount * 100);
			charge.chargeDate = remote.date;
			charge.description = remote.description;
			charge.time = remote.time;
		});
		return { id: localId, kind: "CHARGE" as const };
	}
	const previous = localId ? await localSnapshot("PURCHASE", localId, userId) : null;
	const tags = localId ? await getTagsByEntity("CREDIT_PURCHASE", [localId]) : new Map();
	const id = await materializeImportedPurchase(card, {
		...remote,
		allowBankCorrection: correcting,
		currentInstallment: remote.installmentNumber,
		dueDate: dateObject(remote.dueDate!),
		existingRootId: localId ?? null,
		externalId: reference,
		installmentAmount: remote.amount,
		isStatementCharge: remote.operation === "CHARGE",
		purchaseDate: dateObject(remote.date),
		statementDate: dateObject(remote.statementDate!),
		storeName: (previous?.entity as { storeName?: string } | undefined)?.storeName ?? null,
		tagIds: (tags.get(localId ?? "") ?? []).map((t: { id: string }) => t.id),
		totalAmount: remote.totalAmount!,
	});
	return { id, kind: remote.operation === "CHARGE" ? ("CHARGE" as const) : ("PURCHASE" as const) };
}

async function safelyApplyRemote(
	userId: string,
	binding: Binding,
	record: ExternalRecord,
	remote: NormalizedRecord,
	localId?: string | null,
	correcting = false,
) {
	await executeRaw("SAVEPOINT open_finance_apply");
	try {
		const kind = binding.creditCardId
			? remote.operation === "CHARGE"
				? "CHARGE"
				: "PURCHASE"
			: "TRANSACTION";
		const before = localId ? await localSnapshot(kind, localId, userId) : null;
		const result = await applyRemote(userId, binding, remote, localId, correcting);
		if (before && localId) {
			const siblings = await queryRaw<{ id: string; appliedSnapshot: Record<string, unknown> }>(
				`SELECT "id", "appliedSnapshot" FROM "OpenFinanceRecord" WHERE "userId"=$1 AND "localId"=$2 AND "state"='APPLIED'`,
				[userId, localId],
			);
			const after = await localSnapshot(result.kind, result.id, userId);
			for (const sibling of siblings)
				if (sameSnapshot(sibling.appliedSnapshot, before))
					await executeRaw(`UPDATE "OpenFinanceRecord" SET "appliedSnapshot"=$2::jsonb WHERE "id"=$1`, [
						sibling.id,
						JSON.stringify(after),
					]);
		}
		await executeRaw("RELEASE SAVEPOINT open_finance_apply");
		return result;
	} catch (error) {
		await executeRaw("ROLLBACK TO SAVEPOINT open_finance_apply");
		await executeRaw("RELEASE SAVEPOINT open_finance_apply");
		if (
			!(error instanceof RangeError) &&
			(!(error instanceof HttpException) || ![400, 409, 422].includes(error.statusCode))
		)
			throw error;
		await createReview(userId, binding, record, remote);
		return null;
	}
}

// Caller holds a user/config row lock and wraps each record plus counters in one transaction.
export async function processRecord(
	userId: string,
	binding: Binding,
	remote: NormalizedRecord,
): Promise<ProcessOutcome> {
	const existing = await queryRaw<ExternalRecord>(
		`SELECT DISTINCT ON (r."id") r.* FROM "OpenFinanceRecord" r JOIN "OpenFinanceIdentity" i ON i."recordId"=r."id" WHERE i."userId"=$1 AND i."remoteAccountId"=$2 AND i."externalId"=ANY($3::text[]) ORDER BY r."id"`,
		[userId, binding.remoteAccountId, remote.aliases],
	);
	if (existing.length > 1) throw new Error("Identidades bancárias conflitantes");
	let record = existing[0];
	if (!record) {
		const id = crypto.randomUUID();
		[record] = await queryRaw<ExternalRecord>(
			`INSERT INTO "OpenFinanceRecord" ("id", "userId", "remoteAccountId", "identity", "snapshot", "state") VALUES ($1,$2,$3,$4,$5::jsonb,'NEW') RETURNING *`,
			[id, userId, binding.remoteAccountId, remote.identity, JSON.stringify(remote)],
		);
	}
	await addAliases(userId, binding.remoteAccountId, record.id, remote.aliases);
	if (record.state === "DISCARDED") return "unchanged";
	const unchangedRemote = sameSnapshot(
		{ ...record.snapshot, aliases: [], identity: "" },
		{ ...remote, aliases: [], identity: "" },
	);
	await executeRaw(`UPDATE "OpenFinanceRecord" SET "snapshot"=$2::jsonb, "updatedAt"=now() WHERE "id"=$1`, [
		record.id,
		JSON.stringify(remote),
	]);
	if (remote.pending) {
		await executeRaw(
			`UPDATE "OpenFinanceRecord" SET "state"='BANK_PENDING' WHERE "id"=$1 AND "state" IN ('NEW','BANK_PENDING')`,
			[record.id],
		);
		return record.state === "BANK_PENDING" ? "unchanged" : "pending";
	}
	if (remote.operation === "PAYMENT" && binding.creditCardId) {
		await executeRaw(`UPDATE "OpenFinanceRecord" SET "state"='IGNORED' WHERE "id"=$1`, [record.id]);
		return "unchanged";
	}
	if (record.state === "REVIEW") {
		// Only untouched drafts follow bank corrections; user edits remain intact.
		if (!unchangedRemote) await refreshUntouchedReview(record, remote);
		return "unchanged";
	}
	if (record.state === "APPLIED" && record.localId && record.localKind) {
		const current = await localSnapshot(record.localKind, record.localId, userId);
		if (!current) {
			await executeRaw(`UPDATE "OpenFinanceRecord" SET "state"='DISCARDED' WHERE "id"=$1`, [record.id]);
			return "unchanged";
		}
		const entity = current.entity as Record<string, unknown>;
		const accountCompatible = binding.creditCardId
			? entity.creditCardId === binding.creditCardId
			: entity.originFinancialAccountId === binding.financialAccountId ||
				entity.destinationFinancialAccountId === binding.financialAccountId;
		if (unchangedRemote) return "unchanged";
		if (
			!accountCompatible ||
			!sameSnapshot(current, record.appliedSnapshot) ||
			entity.type === "TRANSFER" ||
			remote.currency !== "BRL" ||
			record.snapshot.operation !== remote.operation ||
			remote.incomplete.length ||
			remote.operation === "REFUND"
		)
			return createReview(
				userId,
				{
					...binding,
					creditCardId: binding.creditCardId ? String(entity.creditCardId) : null,
					financialAccountId: binding.creditCardId
						? null
						: String(entity.originFinancialAccountId ?? entity.destinationFinancialAccountId),
				},
				record,
				remote,
			);
		const result = await safelyApplyRemote(userId, binding, record, remote, record.localId, true);
		if (!result) return "pending";
		await bindLocal(record.id, userId, binding, remote, result.kind, result.id);
		return "imported";
	}
	const candidates = remote.operation === "REFUND" ? [] : await findCandidates(userId, binding, remote);
	if (
		(remote.operation === "PAYMENT" &&
			!candidates.some(candidate => candidate.exact && candidate.raw.paymentCreditCardId)) ||
		remote.currency !== "BRL" ||
		remote.incomplete.length ||
		remote.operation === "REFUND" ||
		candidates.length > 1 ||
		(candidates.length === 1 && !candidates[0].exact)
	)
		return createReview(userId, binding, record, remote);
	const candidate = candidates[0];
	if (candidate?.source === "REVIEW") {
		await executeRaw(
			`UPDATE "OpenFinanceRecord" SET "state"='REVIEW', "reviewItemId"=$2, "importId"=$3 WHERE "id"=$1`,
			[record.id, candidate.id, candidate.importId],
		);
		return "linked";
	}
	if (
		candidate &&
		binding.creditCardId &&
		(candidate.raw.hasImportedAmount === true || remote.operation === "CHARGE")
	) {
		await bindLocal(
			record.id,
			userId,
			binding,
			remote,
			remote.operation === "CHARGE" ? "CHARGE" : "PURCHASE",
			candidate.id,
		);
		return "linked";
	}
	if (candidate && !binding.creditCardId) {
		await bindLocal(record.id, userId, binding, remote, "TRANSACTION", candidate.id);
		return "linked";
	}
	const result = await safelyApplyRemote(userId, binding, record, remote, candidate?.id);
	if (!result) return "pending";
	await bindLocal(record.id, userId, binding, remote, result.kind, result.id);
	return candidate ? "linked" : "imported";
}
