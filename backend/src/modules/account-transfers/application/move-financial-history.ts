import { cashbackReversalsSql } from "~/modules/accounts/application/cashback-reversals-sql";
import { getInstitutionProfileContext } from "~/modules/accounts/application/get-institution-profile-context";
import { normalizeFinancialInstitutionName } from "~/modules/accounts/domain/normalize-financial-institution-name";
import { queryRaw } from "~/shared/infra/sql";
import { sanitizeTransferReview } from "../domain/sanitize-transfer-review";
import { recurrenceMoves } from "../domain/transfer-policy";
import type { Snapshot, TransferRow } from "./transfer-snapshot";

async function insertCopy(table: string, record: TransferRow) {
	await queryRaw(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}",$1::jsonb)`, [
		JSON.stringify(record),
	]);
}
async function protect(userId: string, entityType: string, entityId: string, kind: string) {
	await queryRaw(
		`INSERT INTO "DetachedFinancialRecord" ("id","userId","entityType","entityId","kind") VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("entityType","entityId") DO NOTHING`,
		[crypto.randomUUID(), userId, entityType, entityId, kind],
	);
}

export async function moveFinancialHistory(input: {
	senderId: string;
	recipientId: string;
	accountIds: string[];
	snapshot: Snapshot;
	names: Array<{ id: string; destinationName: string }>;
}) {
	const { senderId, recipientId, accountIds, snapshot, names } = input;
	const selected = new Set(accountIds);
	const originalProfiles = await getInstitutionProfileContext(accountIds);
	const privateInstitutions = await queryRaw<TransferRow>(
		`SELECT institution.* FROM "FinancialInstitution" institution WHERE institution."userId"=$1 AND institution."id" IN (SELECT "institutionId" FROM "FinancialAccount" WHERE "id"=ANY($2))`,
		[senderId, accountIds],
	);
	const privateInstitutionMap = new Map<string, string>();
	for (const institution of privateInstitutions) {
		const used = await queryRaw<{ normalizedName: string }>(
			`SELECT "normalizedName" FROM "FinancialInstitution" WHERE "userId"=$1`,
			[recipientId],
		);
		let renamed = normalizeFinancialInstitutionName(String(institution.name));
		for (let suffix = 2; used.some(row => row.normalizedName === renamed.normalizedName); suffix++)
			renamed = normalizeFinancialInstitutionName(
				`${String(institution.name).slice(0, 90)} (${suffix})`,
			);
		const id = crypto.randomUUID();
		privateInstitutionMap.set(String(institution.id), id);
		await insertCopy("FinancialInstitution", { ...institution, ...renamed, id, userId: recipientId });
	}

	const cardIds = snapshot.CreditCard.filter(row => selected.has(String(row.financialAccountId))).map(row =>
		String(row.id),
	);
	const cardSet = new Set(cardIds);
	const purchases = snapshot.CreditPurchaseRecord.filter(row => cardSet.has(String(row.creditCardId)));
	const purchaseIds = purchases.map(row => String(row.id));
	const entryIds = (
		await queryRaw<{ id: string }>(
			`SELECT entry."id" FROM "CreditEntryReference" entry WHERE entry."purchaseId"=ANY($1) OR entry."installmentId" IN (SELECT "id" FROM "CreditInstallmentRecord" WHERE "purchaseId"=ANY($1)) OR entry."refundId" IN (SELECT "id" FROM "CreditRefundRecord" WHERE "purchaseId"=ANY($1)) OR entry."chargeId" IN (SELECT charge."id" FROM "CreditStatementCharge" charge JOIN "CreditCardStatement" statement ON statement."id"=charge."statementId" WHERE statement."creditCardId"=ANY($2)) OR entry."id" IN (SELECT "id" FROM "CreditRefundReview" WHERE "creditCardId"=ANY($2))`,
			[purchaseIds, cardIds],
		)
	).map(row => row.id);
	const movedEntities = new Set([...accountIds, ...cardIds, ...purchaseIds, ...entryIds]);
	const recurrenceIds: string[] = [];
	for (const recurrence of snapshot.Recurrence.filter(row => row.userId === senderId)) {
		const refs = [
			recurrence.originFinancialAccountId as string | null,
			recurrence.destinationFinancialAccountId as string | null,
			recurrence.creditCardId
				? (snapshot.CreditCard.find(c => c.id === recurrence.creditCardId)
						?.financialAccountId as string)
				: null,
		];
		if (!refs.some(id => id && selected.has(id))) continue;
		if (recurrenceMoves(refs, selected)) {
			recurrenceIds.push(String(recurrence.id));
			movedEntities.add(String(recurrence.id));
		} else
			await queryRaw(
				`UPDATE "Recurrence" SET "isActive"=false,"originFinancialAccountId"=CASE WHEN "originFinancialAccountId"=ANY($1) THEN NULL ELSE "originFinancialAccountId" END,"destinationFinancialAccountId"=CASE WHEN "destinationFinancialAccountId"=ANY($1) THEN NULL ELSE "destinationFinancialAccountId" END,"creditCardId"=CASE WHEN "creditCardId"=ANY($2) THEN NULL ELSE "creditCardId" END,"updatedAt"=now() WHERE "id"=$3`,
				[accountIds, cardIds, recurrence.id],
			);
	}
	// Preserve rewards as dated, independent credits with their original accrual policy.
	const rewardBoundaries = snapshot.CreditPurchaseRecord.filter(
		row =>
			row.cashbackAccountId &&
			selected.has(String(row.cashbackAccountId)) !== cardSet.has(String(row.creditCardId)),
	);
	for (const purchase of rewardBoundaries) {
		const credits = [
			{ amount: purchase.cashbackAmount, date: purchase.purchaseDate },
			...(await queryRaw<{ amount: number; date: Date }>(
				`SELECT amount,date FROM (${cashbackReversalsSql}) reversal WHERE "purchaseId"=$1`,
				[purchase.id],
			)),
		];
		for (const credit of credits)
			if (Number(credit.amount))
				await queryRaw(
					`INSERT INTO "DetachedRewardCredit" ("id","financialAccountId","amount","date","yieldReferenceRate","yieldReferencePercentage","yieldPeriod") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
					[
						crypto.randomUUID(),
						purchase.cashbackAccountId,
						credit.amount,
						credit.date,
						purchase.cashbackYieldReferenceRate,
						purchase.cashbackYieldReferencePercentage,
						purchase.cashbackYieldPeriod,
					],
				);
		await queryRaw(
			`UPDATE "CreditPurchaseRecord" SET "cashbackAccountId"=NULL,"updatedAt"=now() WHERE "id"=$1`,
			[purchase.id],
		);
	}
	// One-sided transfer/payment records retain their semantic type and booked amounts.
	for (const transaction of snapshot.Transaction.filter(row => row.userId === senderId)) {
		const refs = [
			transaction.originFinancialAccountId,
			transaction.destinationFinancialAccountId,
			transaction.paymentCreditCardId
				? snapshot.CreditCard.find(c => c.id === transaction.paymentCreditCardId)?.financialAccountId
				: null,
		]
			.filter(Boolean)
			.map(String);
		if (!refs.some(id => selected.has(id))) continue;
		const moving: TransferRow = { ...transaction, userId: recipientId };
		if (transaction.recurrenceId && !recurrenceIds.includes(String(transaction.recurrenceId))) {
			moving.recurrenceId = null;
			moving.recurrenceOccurrenceDate = null;
		}
		if (refs.every(id => selected.has(id))) {
			await queryRaw(
				`UPDATE "Transaction" SET "userId"=$1,"recurrenceId"=$2,"recurrenceOccurrenceDate"=$3,"updatedAt"=now() WHERE "id"=$4`,
				[recipientId, moving.recurrenceId, moving.recurrenceOccurrenceDate, transaction.id],
			);
			movedEntities.add(String(transaction.id));
		} else {
			const copyId = crypto.randomUUID();
			moving.id = copyId;
			const staying: TransferRow = { ...transaction };
			for (const field of [
				"originFinancialAccountId",
				"destinationFinancialAccountId",
				"paymentCreditCardId",
			]) {
				const id = transaction[field];
				const isMoving =
					field === "paymentCreditCardId" ? cardSet.has(String(id)) : selected.has(String(id));
				if (isMoving) staying[field] = null;
				else moving[field] = null;
			}
			if (recurrenceIds.includes(String(staying.recurrenceId))) {
				staying.recurrenceId = null;
				staying.recurrenceOccurrenceDate = null;
			}
			await queryRaw(
				`UPDATE "Transaction" SET "originFinancialAccountId"=$1,"destinationFinancialAccountId"=$2,"paymentCreditCardId"=$3,"recurrenceId"=$4,"recurrenceOccurrenceDate"=$5,"updatedAt"=now() WHERE "id"=$6`,
				[
					staying.originFinancialAccountId,
					staying.destinationFinancialAccountId,
					staying.paymentCreditCardId,
					staying.recurrenceId,
					staying.recurrenceOccurrenceDate,
					transaction.id,
				],
			);
			await insertCopy("Transaction", moving);
			for (const tag of snapshot.TagAssignment.filter(row => row.entityId === transaction.id)) {
				const copied = { ...tag, entityId: copyId, id: crypto.randomUUID() };
				await insertCopy("TagAssignment", copied);
				snapshot.TagAssignment.push(copied);
			}
			for (const history of snapshot.TransactionHistory.filter(
				row =>
					row.transactionId === transaction.id &&
					!/(account|recurrence|category|debt|person|user|snapshot|json|split)/i.test(
						String(row.field),
					),
			))
				await insertCopy("TransactionHistory", {
					...history,
					id: crypto.randomUUID(),
					transactionId: copyId,
				});
			const kind = transaction.paymentCreditCardId ? "CARD_PAYMENT" : "TRANSFER";
			await protect(senderId, "Transaction", String(transaction.id), kind);
			await protect(recipientId, "Transaction", copyId, kind);
			movedEntities.add(copyId);
			// Bank references follow the account side, including references in pending reviews.
			await queryRaw(
				`UPDATE "TransactionExternalReference" SET "transactionId"=$1 WHERE "transactionId"=$2 AND "financialAccountId"=ANY($3)`,
				[copyId, transaction.id, accountIds],
			);
			await queryRaw(
				`UPDATE "TransactionImportItem" item SET "reconciledTransactionId"=$1 FROM "TransactionImport" batch WHERE item."transactionImportId"=batch."id" AND batch."financialAccountId"=ANY($3) AND item."reconciledTransactionId"=$2`,
				[copyId, transaction.id, accountIds],
			);
		}
	}
	for (const payment of snapshot.LoanPayment.filter(row => selected.has(String(row.financialAccountId)))) {
		if (payment.paidDate) {
			const id = crypto.randomUUID();
			await queryRaw(
				`INSERT INTO "Transaction" ("id","userId","amount","date","type","originFinancialAccountId","currency","bookingCurrency","description") VALUES ($1,$2,$3,$4,'EXPENSE',$5,$6,$6,'Pagamento de empréstimo - histórico transferido')`,
				[
					id,
					recipientId,
					payment.accountAmount ?? payment.totalPaid,
					payment.paidDate,
					payment.financialAccountId,
					payment.accountCurrency ?? payment.currency,
				],
			);
			await protect(recipientId, "Transaction", id, "LOAN_PAYMENT");
			movedEntities.add(id);
		}
		await queryRaw(`UPDATE "LoanPayment" SET "financialAccountId"=NULL,"updatedAt"=now() WHERE "id"=$1`, [
			payment.id,
		]);
	}
	// Debts stay with their existing parties, with a stable description after detachment.
	const originalMovedIds = snapshot.Transaction.filter(row => movedEntities.has(String(row.id))).map(row =>
		String(row.id),
	);
	await queryRaw(
		`DELETE FROM "TransactionTransferSuggestionRejection" WHERE "firstTransactionId"=ANY($1) OR "secondTransactionId"=ANY($1)`,
		[originalMovedIds],
	);
	await queryRaw(
		`DELETE FROM "TransactionImportTransferSuggestionRejection" WHERE "outgoingFinancialAccountId"=ANY($1) OR "incomingFinancialAccountId"=ANY($1)`,
		[accountIds],
	);
	await queryRaw(
		`UPDATE "DebtEvent" event SET "description"=COALESCE(event."description",transaction."description",transaction."storeName",'Lançamento transferido') FROM "DebtTransactionLink" link JOIN "Transaction" transaction ON transaction."id"=link."transactionId" WHERE link."eventId"=event."id" AND link."transactionId"=ANY($1)`,
		[originalMovedIds],
	);
	await queryRaw(
		`UPDATE "DebtEvent" event SET "description"=COALESCE(event."description",purchase."description",purchase."storeName",'Compra transferida') FROM "DebtPurchaseLink" link JOIN "CreditEntryReference" entry ON entry."id"=link."creditPurchaseId" JOIN "CreditPurchaseRecord" purchase ON purchase."id"=entry."purchaseId" WHERE link."eventId"=event."id" AND link."creditPurchaseId"=ANY($1)`,
		[entryIds],
	);
	await queryRaw(`DELETE FROM "DebtTransactionLink" WHERE "transactionId"=ANY($1)`, [originalMovedIds]);
	await queryRaw(`DELETE FROM "DebtPurchaseLink" WHERE "creditPurchaseId"=ANY($1)`, [entryIds]);
	const splitIds = snapshot.DebtSplit.filter(
		row =>
			movedEntities.has(String(row.transactionId)) ||
			entryIds.includes(String(row.creditPurchaseId)) ||
			recurrenceIds.includes(String(row.recurrenceId)) ||
			snapshot.TransactionImportItem.some(
				item =>
					item.id === row.transactionImportItemId &&
					snapshot.TransactionImport.some(
						batch =>
							batch.id === item.transactionImportId &&
							selected.has(String(batch.financialAccountId)),
					),
			) ||
			snapshot.CreditCardImportItem.some(
				item =>
					item.id === row.creditCardImportItemId &&
					snapshot.CreditCardImport.some(
						batch =>
							batch.id === item.creditCardImportId && cardSet.has(String(batch.creditCardId)),
					),
			),
	).map(row => row.id);
	await queryRaw(`DELETE FROM "DebtSplit" WHERE "id"=ANY($1)`, [splitIds]);
	// Copy only used tags/categories; retain the sender's private category tree.
	const tags = snapshot.TagAssignment.filter(row => movedEntities.has(String(row.entityId)));
	const importItems = [
		...snapshot.TransactionImportItem.filter(row =>
			snapshot.TransactionImport.some(
				batch =>
					batch.id === row.transactionImportId && selected.has(String(batch.financialAccountId)),
			),
		),
		...snapshot.CreditCardImportItem.filter(row =>
			snapshot.CreditCardImport.some(
				batch => batch.id === row.creditCardImportId && cardSet.has(String(batch.creditCardId)),
			),
		),
	];
	const categoryIds = new Set([
		...tags.map(row => String(row.categoryId)),
		...importItems.filter(row => row.categoryId).map(row => String(row.categoryId)),
	]);
	const categoryMap = new Map<string, string>();
	const copyCategory = async (id: string): Promise<string> => {
		if (categoryMap.has(id)) return categoryMap.get(id)!;
		const row = snapshot.Category.find(row => row.id === id);
		if (!row) return id;
		const parentId = row.parentId ? await copyCategory(String(row.parentId)) : null;
		const used = new Set(
			snapshot.Category.filter(row => row.userId === recipientId).map(row => String(row.name)),
		);
		let name = String(row.name);
		for (let suffix = 2; used.has(name); suffix++) name = `${String(row.name).slice(0, 40)} (${suffix})`;
		const newId = crypto.randomUUID();
		categoryMap.set(id, newId);
		const copied = { ...row, id: newId, name, parentId, userId: recipientId };
		snapshot.Category.push(copied);
		await insertCopy("Category", copied);
		return newId;
	};
	for (const id of categoryIds) await copyCategory(id);
	for (const tag of tags) {
		await queryRaw(`UPDATE "TagAssignment" SET "categoryId"=$1 WHERE "id"=$2`, [
			categoryMap.get(String(tag.categoryId)),
			tag.id,
		]);
	}
	for (const item of importItems)
		if (item.categoryId) {
			const table = "transactionImportId" in item ? "TransactionImportItem" : "CreditCardImportItem";
			await queryRaw(`UPDATE "${table}" SET "categoryId"=$1 WHERE "id"=$2`, [
				categoryMap.get(String(item.categoryId)),
				item.id,
			]);
		}
	// Private institution/profile history is copied only when no destination link exists.
	const institutionIds = snapshot.FinancialAccount.filter(row => selected.has(String(row.id))).flatMap(
		row => (row.institutionId ? [String(row.institutionId)] : []),
	);
	for (const sourceInstitutionId of new Set(institutionIds)) {
		const institutionId = privateInstitutionMap.get(sourceInstitutionId) ?? sourceInstitutionId;
		const source = snapshot.UserFinancialInstitution.find(
			row => row.userId === senderId && row.institutionId === sourceInstitutionId,
		);
		const target = snapshot.UserFinancialInstitution.find(
			row => row.userId === recipientId && row.institutionId === institutionId,
		);
		if (!target) {
			const id = crypto.randomUUID();
			await queryRaw(
				`INSERT INTO "UserFinancialInstitution" ("id","userId","institutionId","globalRulesFrom") VALUES ($1,$2,$3,$4)`,
				[id, recipientId, institutionId, source?.globalRulesFrom ?? null],
			);
			for (const change of snapshot.UserInstitutionProfileChange.filter(
				row => row.linkId === source?.id && !privateInstitutionMap.has(sourceInstitutionId),
			))
				await insertCopy("UserInstitutionProfileChange", {
					...change,
					id: crypto.randomUUID(),
					linkId: id,
				});
		}
	}
	await queryRaw(
		`UPDATE "CreditCard" card SET "paymentAccountId"=CASE WHEN (card."id"=ANY($1))<>(card."paymentAccountId"=ANY($2)) THEN NULL ELSE card."paymentAccountId" END,"cashbackAccountId"=CASE WHEN (card."id"=ANY($1))<>(card."cashbackAccountId"=ANY($2)) THEN NULL ELSE card."cashbackAccountId" END WHERE card."id"=ANY($1) OR card."paymentAccountId"=ANY($2) OR card."cashbackAccountId"=ANY($2)`,
		[cardIds, accountIds],
	);
	for (const [oldId, newId] of privateInstitutionMap)
		await queryRaw(
			`UPDATE "FinancialAccount" SET "institutionId"=$1 WHERE "id"=ANY($2) AND "institutionId"=$3`,
			[newId, accountIds, oldId],
		);
	for (const account of names)
		await queryRaw(
			`UPDATE "FinancialAccount" SET "userId"=$1,"name"=$2,"isPrimary"=false,"isDefaultForStatements"=false,"transferredProfileContext"=$4::json,"updatedAt"=now() WHERE "id"=$3`,
			[
				recipientId,
				account.destinationName,
				account.id,
				JSON.stringify(originalProfiles.get(account.id) ?? null, (key, value) =>
					key === "transferredProfileContext" ? undefined : value,
				),
			],
		);
	for (const [table, field, ids] of [
		["CreditPurchaseRecord", "creditCardId", cardIds],
		["CreditRefundReview", "creditCardId", cardIds],
		["CreditCardImport", "creditCardId", cardIds],
		["TransactionImport", "financialAccountId", accountIds],
		["BalanceAdjustment", "financialAccountId", accountIds],
		["Recurrence", "id", recurrenceIds],
	] as const)
		await queryRaw(`UPDATE "${table}" SET "userId"=$1,"updatedAt"=now() WHERE "${field}"=ANY($2)`, [
			recipientId,
			ids,
		]);
	await queryRaw(
		`UPDATE "DetachedFinancialRecord" record SET "userId"=$1 WHERE "entityType"='Transaction' AND EXISTS(SELECT 1 FROM "Transaction" movement WHERE movement."id"=record."entityId" AND movement."userId"=$1)`,
		[recipientId],
	);
	await queryRaw(`UPDATE "CreditBookTombstone" SET "userId"=$1 WHERE "creditCardId"=ANY($2)`, [
		recipientId,
		cardIds,
	]);
	// Occurrence reservations remain even when a linked record changed owner.
	await queryRaw(
		`UPDATE "Transaction" SET "recurrenceId"=NULL,"recurrenceOccurrenceDate"=NULL WHERE "userId"=$1 AND "recurrenceId"=ANY($2)`,
		[senderId, recurrenceIds],
	);
	await queryRaw(
		`UPDATE "CreditPurchaseRecord" SET "recurrenceId"=NULL,"recurrenceOccurrenceDate"=NULL WHERE "userId"=$1 AND "recurrenceId"=ANY($2)`,
		[
			recipientId,
			snapshot.Recurrence.filter(row => !recurrenceIds.includes(String(row.id))).map(row => row.id),
		],
	);
	await queryRaw(
		`UPDATE "RecurrenceOccurrence" occurrence SET "transactionId"=NULL FROM "Recurrence" recurrence,"Transaction" movement WHERE occurrence."recurrenceId"=recurrence."id" AND occurrence."transactionId"=movement."id" AND recurrence."userId"<>movement."userId"`,
	);
	await queryRaw(
		`UPDATE "RecurrenceOccurrence" occurrence SET "purchaseId"=NULL FROM "Recurrence" recurrence,"CreditPurchaseRecord" purchase WHERE occurrence."recurrenceId"=recurrence."id" AND occurrence."purchaseId"=purchase."id" AND recurrence."userId"<>purchase."userId"`,
	);
	// Stop credential-backed writes before the ownership barrier is released.
	await queryRaw(
		`UPDATE "OpenFinanceBinding" SET "paused"=true,"financialAccountId"=NULL,"creditCardId"=NULL WHERE "financialAccountId"=ANY($1) OR "creditCardId"=ANY($2)`,
		[accountIds, cardIds],
	);
	await queryRaw(
		`UPDATE "OpenFinanceRecord" SET "localId"=NULL,"importId"=NULL,"reviewItemId"=NULL,"snapshot"='{}',"appliedSnapshot"=NULL,"state"='DETACHED' WHERE "userId"=$1 AND ("localId"=ANY($2) OR "importId" IN (SELECT "id" FROM "TransactionImport" WHERE "financialAccountId"=ANY($3)) OR "importId" IN (SELECT "id" FROM "CreditCardImport" WHERE "creditCardId"=ANY($4)))`,
		[senderId, [...movedEntities], accountIds, cardIds],
	);
	// Scrub references in pending import reviews that would otherwise cross owners.

	// Sanitization is structural, never a rewrite of descriptions or financial values.
	for (const table of ["TransactionImportItem", "CreditCardImportItem"]) {
		const parent = table === "TransactionImportItem" ? "TransactionImport" : "CreditCardImport";
		const fk = table === "TransactionImportItem" ? "transactionImportId" : "creditCardImportId";
		const rows = await queryRaw<TransferRow>(
			`SELECT item.* FROM "${table}" item JOIN "${parent}" batch ON batch."id"=item."${fk}" WHERE batch."userId"=ANY($1::text[])`,
			[[senderId, recipientId]],
		);
		for (const row of rows)
			for (const field of [
				"originFinancialAccountId",
				"destinationFinancialAccountId",
				"paymentCreditCardId",
				"reconciledTransactionId",
				"reconciledImportItemId",
				"reconciledCreditPurchaseId",
			])
				if (row[field]) {
					const refTable =
						field === "reconciledImportItemId"
							? "TransactionImportItem"
							: field === "reconciledCreditPurchaseId"
								? "CreditEntryReference"
								: field === "paymentCreditCardId"
									? "CreditCard"
									: field === "reconciledTransactionId"
										? "Transaction"
										: "FinancialAccount";
					await queryRaw(
						`UPDATE "${table}" item SET "${field}"=NULL FROM "${parent}" batch WHERE item."id"=$1 AND batch."id"=item."${fk}" AND NOT EXISTS(SELECT 1 FROM "${refTable}" ref WHERE ref."id"=item."${field}" AND zaimu_record_owner($2,to_jsonb(ref))=batch."userId")`,
						[row.id, refTable],
					);
				}
	}
	const privateIds = new Set(
		Object.values(snapshot).flatMap(rows =>
			rows.flatMap(row =>
				[row.id, row.debtPersonId, row.remainderDebtPersonId, row.connectionId, row.eventId].filter(
					(id): id is string => typeof id === "string",
				),
			),
		),
	);
	const retainedIds = new Set([
		...movedEntities,
		...categoryMap.values(),
		...snapshot.institutionRules.map(row => String(row.id)),
		...snapshot.institutionPolicies.map(row => String(row.id)),
		...snapshot.FinancialAccount.filter(row => row.userId === recipientId).map(row => String(row.id)),
	]);
	const transferredReviewRows = [
		...importItems.map(item => ({
			id: String(item.id),
			table: "transactionImportId" in item ? "TransactionImportItem" : "CreditCardImportItem",
		})),
		...snapshot.CreditRefundReview.filter(row => cardSet.has(String(row.creditCardId))).map(row => ({
			id: String(row.id),
			table: "CreditRefundReview",
		})),
	];
	for (const review of transferredReviewRows) {
		const [stored] = await queryRaw<TransferRow>(`SELECT * FROM "${review.table}" WHERE "id"=$1`, [
			review.id,
		]);
		if (!stored) continue;
		for (const [field, value] of Object.entries(stored))
			if (value && typeof value === "object" && !(value instanceof Date)) {
				const clean = sanitizeTransferReview(
					value,
					privateIds,
					retainedIds,
					categoryMap,
					senderId,
					recipientId,
				);
				if (JSON.stringify(value) !== JSON.stringify(clean))
					await queryRaw(`UPDATE "${review.table}" SET "${field}"=$1::json WHERE "id"=$2`, [
						JSON.stringify(clean),
						review.id,
					]);
			}
	}
	// Histories contain raw IDs/old JSON snapshots; remove private linkage changes.
	for (const table of [
		"TransactionHistory",
		"CreditCardHistory",
		"CreditPurchaseHistory",
		"RecurrenceHistory",
	]) {
		await queryRaw(
			`DELETE FROM "${table}" history WHERE zaimu_record_owner($1,to_jsonb(history))=$2 AND history."field" ~* '(account|recurrence|category|debt|person|user|snapshot|json|split)'`,
			[table, recipientId],
		);
	}
}
