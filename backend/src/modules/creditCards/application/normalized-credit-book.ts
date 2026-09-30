import {
	type BookPurchase,
	bookPurchase,
	type CreditBook,
	creditBookEntries,
	materializeBookInstallments,
	moneyCents,
	moveBookPurchase,
	newBookPurchase,
	replayCreditBook,
} from "@zaimu/finance/credit-book";
import { currentDateKey, recalculateStatementDueDate } from "@zaimu/finance/credit-card";
import { assertPurchase, distributePurchaseCents } from "@zaimu/finance/credit-purchase";
import {
	assertTagOwnership,
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import {
	deleteCreatorDebtEventForPurchase,
	getDebtSplitInput,
	getDebtSplitReturns,
	replaceDebtSplit,
	syncPurchaseDebtEvent,
} from "~/modules/debts/application";
import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { syncRefundDebtEvents } from "./normalized-refund-debts";
import type { RawQuery } from "./normalized-statement-replay";

type Row = Record<string, unknown>;
const date = (value: unknown): string =>
	value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const timestamp = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));

/** All writers lock the card before loading. Raw and ORM helpers share this transaction. */
export async function loadCreditBook(
	query: RawQuery,
	userId: string,
	cardId: string,
	lock = false,
): Promise<CreditBook> {
	const [card] = await query<CreditBook["card"]>(
		`SELECT c."id", a."userId", c."statementDay", c."dueDay", c."workingDueDate", c."ignoreStatementsBefore"::text AS "ignoreStatementsBefore", a."institutionId", i."creditRefundPolicy" AS "refundPolicy" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id" = c."financialAccountId" LEFT JOIN "FinancialInstitution" i ON i."id" = a."institutionId" WHERE c."id" = $1 AND a."userId" = $2 ${lock ? "FOR UPDATE OF c" : ""}`,
		[cardId, userId],
	);
	if (!card) throw new HttpException("Cartão não encontrado", 404);
	const purchases = await query<Row>(
		`SELECT * FROM "CreditPurchaseRecord" WHERE "creditCardId" = $1 AND "userId" = $2 ORDER BY "id"`,
		[cardId, userId],
	);
	const plans = await query<Row>(
		`SELECT plan.* FROM "CreditInstallmentPlan" plan JOIN "CreditPurchaseRecord" p ON p."id" = plan."purchaseId" WHERE p."creditCardId" = $1 ORDER BY plan."number"`,
		[cardId],
	);
	const installments = await query<Row>(
		`SELECT i.* FROM "CreditInstallmentRecord" i JOIN "CreditPurchaseRecord" p ON p."id" = i."purchaseId" WHERE p."creditCardId" = $1`,
		[cardId],
	);
	const refunds = await query<Row>(
		`SELECT r.* FROM "CreditRefundRecord" r JOIN "CreditPurchaseRecord" p ON p."id" = r."purchaseId" WHERE p."creditCardId" = $1 ORDER BY r."createdAt", r."id"`,
		[cardId],
	);
	const charges = await query<Row>(
		`SELECT ch.* FROM "CreditStatementCharge" ch JOIN "CreditCardStatement" s ON s."id" = ch."statementId" WHERE s."creditCardId" = $1`,
		[cardId],
	);
	const statements = await query<Row>(`SELECT * FROM "CreditCardStatement" WHERE "creditCardId" = $1`, [
		cardId,
	]);
	const payments = await query<Row>(
		`SELECT "id", "amount", "date" FROM "Transaction" WHERE "paymentCreditCardId" = $1 AND "userId" = $2`,
		[cardId, userId],
	);
	const tombstones = await query<{ id: string; entryKind: string }>(
		`SELECT "id","entryKind" FROM "CreditBookTombstone" WHERE "creditCardId"=$1 AND "userId"=$2`,
		[cardId, userId],
	);
	const tags = await getTagsByEntity(
		tagEntityType.creditPurchase,
		purchases.map(p => String(p.id)),
	);
	return {
		card,
		charges: charges.map(row => ({
			amountCents: moneyCents(Number(row.amount), 1),
			chargeDate: date(row.chargeDate),
			description: String(row.description),
			externalId: row.externalId as string | null,
			id: String(row.id),
			isSettled: Boolean(row.isSettled),
			settledByPurchaseId: row.settledByPurchaseId as string | null,
			statementId: String(row.statementId),
			time: row.time as string | null,
		})),
		deletedChargeIds: tombstones.filter(t => t.entryKind === "CHARGE").map(t => t.id),
		deletedPurchaseIds: tombstones.filter(t => t.entryKind === "PURCHASE").map(t => t.id),
		installments: installments.map(row => ({
			amountCents: moneyCents(Number(row.amount), 1),
			hasImportedAmount: Boolean(row.hasImportedAmount),
			id: String(row.id),
			isSettled: Boolean(row.isSettled),
			number: Number(row.number),
			occurrenceDate: date(row.occurrenceDate),
			purchaseId: String(row.purchaseId),
			settledByPurchaseId: row.settledByPurchaseId as string | null,
			statementId: String(row.statementId),
		})),
		payments: payments.map(row => ({ amount: Number(row.amount), date: date(row.date), id: String(row.id) })),
		purchases: await Promise.all(
			purchases.map(async p => {
				const plan = plans.filter(row => row.purchaseId === p.id);
				return {
					...p,
					createdAt: timestamp(p.createdAt),
					debtSplitRule: (await getDebtSplitInput({ creditPurchaseId: String(p.id) })) ?? null,
					installmentAmountsCents: plan.map(row => moneyCents(Number(row.amount), 1)),
					installmentImportedNumbers: plan
						.filter(row => row.hasImportedAmount)
						.map(row => Number(row.number)),
					installmentStatementDates: plan.map(row =>
						row.statementDate ? { dueDate: date(row.dueDate), statementDate: date(row.statementDate) } : null,
					),
					purchaseDate: date(p.purchaseDate),
					subscriptionOccurrenceDate: p.subscriptionOccurrenceDate
						? date(p.subscriptionOccurrenceDate)
						: null,
					tagIds: (tags.get(String(p.id)) ?? []).map(tag => tag.id),
					totalAmountCents: moneyCents(Number(p.totalAmount), 1),
					updatedAt: timestamp(p.updatedAt),
				} as unknown as BookPurchase;
			}),
		),
		refunds: refunds.map(row => ({
			amountCents: moneyCents(Number(row.amount), 1),
			cancellationEligible: Boolean(row.cancellationEligible),
			createdAt: timestamp(row.createdAt),
			creditDate: date(row.creditDate),
			creditStatementId: String(row.statementId),
			deletedAt: row.deletedAt ? timestamp(row.deletedAt) : null,
			externalId: row.externalId as string | null,
			id: String(row.id),
			policy: row.policy as CreditBook["refunds"][number]["policy"],
			purchaseId: String(row.purchaseId),
			time: row.time as string | null,
			updatedAt: timestamp(row.updatedAt),
		})),
		statements: statements.map(
			row =>
				({
					...row,
					dueDate: date(row.dueDate),
					paidAmount: Number(row.paidAmount),
					statementDate: date(row.statementDate),
					totalAmount: Number(row.totalAmount),
				}) as CreditBook["statements"][number],
		),
	};
}

const purchaseColumns = [
	"id",
	"userId",
	"creditCardId",
	"description",
	"storeName",
	"purchaseDate",
	"time",
	"totalAmount",
	"feeDescription",
	"feeAmount",
	"refinancingFeeAmount",
	"categoryId",
	"cashbackAccountId",
	"cashbackAmount",
	"cashbackYieldReferenceRate",
	"cashbackYieldReferencePercentage",
	"cashbackYieldPeriod",
	"subscriptionId",
	"subscriptionOccurrenceDate",
	"externalId",
	"createdAt",
	"updatedAt",
] as const;
async function upsert(
	query: RawQuery,
	table: string,
	columns: readonly string[],
	values: unknown[],
	key: readonly string[] = ["id"],
) {
	const quote = (value: string) => `"${value}"`;
	await query(
		`INSERT INTO "${table}" (${columns.map(quote).join(",")}) VALUES (${values.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT (${key.map(quote).join(",")}) DO UPDATE SET ${columns
			.filter(column => !key.includes(column) && column !== "createdAt")
			.map(column => `${quote(column)} = EXCLUDED.${quote(column)}`)
			.join(",")}`,
		values,
	);
}

export async function saveCreditBook(
	query: RawQuery,
	book: CreditBook,
	previous: CreditBook,
	transferredPurchaseIds: ReadonlySet<string> = new Set(),
) {
	const deletedPurchases = [
		...new Set([
			...(book.deletedPurchaseIds ?? []),
			...previous.purchases
				.filter(p => !transferredPurchaseIds.has(p.id) && !book.purchases.some(next => next.id === p.id))
				.map(p => p.id),
		]),
	];
	const deletedCharges = [
		...new Set([
			...(book.deletedChargeIds ?? []),
			...previous.charges.filter(ch => !book.charges.some(next => next.id === ch.id)).map(ch => ch.id),
		]),
	];
	const ids = [...book.purchases.map(p => p.id), ...book.charges.map(ch => ch.id)];
	if ((await query(`SELECT "id" FROM "CreditBookTombstone" WHERE "id"=ANY($1)`, [ids])).length)
		throw new HttpException("Registro excluído não pode ser restaurado pelo sync", 409);
	for (const [entryKind, deletedIds, table, scope] of [
		["PURCHASE", deletedPurchases, "CreditPurchaseRecord", '"creditCardId"'],
		[
			"CHARGE",
			deletedCharges,
			"CreditStatementCharge",
			'(SELECT "creditCardId" FROM "CreditCardStatement" WHERE "id"=target."statementId")',
		],
	] as const) {
		if (
			(
				await query(`SELECT "id" FROM "${table}" target WHERE "id"=ANY($1) AND ${scope}<>$2`, [
					deletedIds,
					book.card.id,
				])
			).length
		)
			throw new HttpException("Exclusão pertence a outro cartão", 403);
		for (const id of deletedIds) {
			const old = await query(
				`SELECT "id" FROM "CreditBookTombstone" WHERE "id"=$1 AND ("userId"<>$2 OR "creditCardId"<>$3)`,
				[id, book.card.userId, book.card.id],
			);
			if (old.length) throw new HttpException("Exclusão pertence a outro usuário", 403);
			await query(
				`INSERT INTO "CreditBookTombstone" ("id","userId","creditCardId","entryKind") VALUES ($1,$2,$3,$4) ON CONFLICT ("id") DO NOTHING`,
				[id, book.card.userId, book.card.id, entryKind],
			);
		}
	}
	book.deletedPurchaseIds = deletedPurchases;
	book.deletedChargeIds = deletedCharges;

	const scopes: [string, string[], string][] = [
		["CreditPurchaseRecord", book.purchases.map(p => p.id), `"creditCardId"`],
		["CreditCardStatement", book.statements.map(s => s.id), `"creditCardId"`],
		[
			"CreditInstallmentRecord",
			book.installments.map(i => i.id),
			`(SELECT "creditCardId" FROM "CreditPurchaseRecord" WHERE "id"=target."purchaseId")`,
		],
		[
			"CreditRefundRecord",
			book.refunds.map(r => r.id),
			`(SELECT "creditCardId" FROM "CreditPurchaseRecord" WHERE "id"=target."purchaseId")`,
		],
		[
			"CreditStatementCharge",
			book.charges.map(ch => ch.id),
			`(SELECT "creditCardId" FROM "CreditCardStatement" WHERE "id"=target."statementId")`,
		],
	];
	for (const [table, ids, scope] of scopes) {
		if (
			(
				await query(`SELECT "id" FROM "${table}" target WHERE "id"=ANY($1) AND ${scope}<>$2`, [
					ids,
					book.card.id,
				])
			).length
		)
			throw new HttpException("Identidade pertence a outro cartão", 403);
	}
	for (const i of book.installments) {
		const p = book.purchases.find(p => p.id === i.purchaseId);
		if (
			!p ||
			p.installmentAmountsCents[i.number - 1] !== i.amountCents ||
			!book.statements.some(s => s.id === i.statementId)
		)
			throw new HttpException("Parcela não corresponde à compra e fatura", 400);
	}

	for (const p of book.purchases) {
		assertPurchase(p);
		if (p.userId !== book.card.userId || p.creditCardId !== book.card.id)
			throw new HttpException("Titularidade da compra inválida", 403);
		await assertTagOwnership([...p.tagIds, ...(p.categoryId ? [p.categoryId] : [])], book.card.userId);
		for (const [table, id] of [
			["FinancialAccount", p.cashbackAccountId],
			["Subscription", p.subscriptionId],
		] as const) {
			if (
				id &&
				!(await query(`SELECT "id" FROM "${table}" WHERE "id"=$1 AND "userId"=$2`, [id, book.card.userId]))
					.length
			)
				throw new HttpException("Vínculo pertence a outro usuário", 403);
		}
	}
	for (const r of book.refunds)
		if (
			!book.purchases.some(p => p.id === r.purchaseId) ||
			!book.statements.some(s => s.id === r.creditStatementId)
		)
			throw new HttpException("Vínculo do reembolso inválido", 400);
	if (new Set(book.statements.map(s => s.statementDate)).size !== book.statements.length)
		throw new HttpException("Calendário contém faturas duplicadas", 409);
	if (book.card.institutionId && book.card.refundPolicy !== previous.card.refundPolicy) {
		const changed = await query(
			`UPDATE "FinancialInstitution" SET "creditRefundPolicy" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2 AND "userId" = $3 AND ("creditRefundPolicy" IS NULL OR "creditRefundPolicy" = $1) RETURNING "id"`,
			[book.card.refundPolicy, book.card.institutionId, book.card.userId],
		);
		if (!changed.length) throw new HttpException("Política de reembolso da instituição já definida", 409);
	}
	for (const p of previous.purchases.filter(
		p => !transferredPurchaseIds.has(p.id) && !book.purchases.some(next => next.id === p.id),
	)) {
		await deleteCreatorDebtEventForPurchase(p.id, book.card.userId);
		for (const r of previous.refunds.filter(r => r.purchaseId === p.id))
			await deleteCreatorDebtEventForPurchase(r.id, book.card.userId);
		await query(`DELETE FROM "CreditPurchaseRecord" WHERE "id" = $1 AND "userId" = $2`, [
			p.id,
			book.card.userId,
		]);
	}
	for (const s of book.statements)
		await upsert(
			query,
			"CreditCardStatement",
			[
				"id",
				"creditCardId",
				"statementDate",
				"dueDate",
				"totalAmount",
				"paidAmount",
				"isPaid",
				"isFullySynced",
			],
			[
				s.id,
				book.card.id,
				s.statementDate,
				s.dueDate,
				s.totalAmount,
				s.paidAmount,
				s.isPaid,
				s.isFullySynced,
			],
		);
	for (const p of book.purchases) {
		const row = { ...p, totalAmount: p.totalAmountCents / 100 };
		await upsert(
			query,
			"CreditPurchaseRecord",
			purchaseColumns,
			purchaseColumns.map(column => row[column]),
		);
		await query(`DELETE FROM "CreditInstallmentPlan" WHERE "purchaseId" = $1 AND "number" > $2`, [
			p.id,
			p.installmentAmountsCents.length,
		]);
		for (const [index, amount] of p.installmentAmountsCents.entries()) {
			const calendar = p.installmentStatementDates?.[index];
			await upsert(
				query,
				"CreditInstallmentPlan",
				["purchaseId", "number", "amount", "hasImportedAmount", "statementDate", "dueDate"],
				[
					p.id,
					index + 1,
					amount / 100,
					p.installmentImportedNumbers?.includes(index + 1) ?? false,
					calendar?.statementDate ?? null,
					calendar?.dueDate ?? null,
				],
				["purchaseId", "number"],
			);
		}
		await query(
			`INSERT INTO "CreditEntryReference" ("id","purchaseId") VALUES ($1,$1) ON CONFLICT ("id") DO NOTHING`,
			[p.id],
		);
		await replaceEntityTags({
			entityIds: [p.id],
			entityType: tagEntityType.creditPurchase,
			tagIds: [...p.tagIds],
		});
	}
	for (const i of book.installments) {
		await upsert(
			query,
			"CreditInstallmentRecord",
			[
				"id",
				"purchaseId",
				"statementId",
				"number",
				"amount",
				"occurrenceDate",
				"hasImportedAmount",
				"settledByPurchaseId",
				"isSettled",
			],
			[
				i.id,
				i.purchaseId,
				i.statementId,
				i.number,
				i.amountCents / 100,
				i.occurrenceDate,
				i.hasImportedAmount,
				i.settledByPurchaseId,
				i.isSettled ?? false,
			],
		);
		await upsert(
			query,
			"CreditEntryReference",
			["id", "purchaseId", "installmentId"],
			[i.id, i.purchaseId, i.id],
		);
	}
	for (const r of book.refunds) {
		await upsert(
			query,
			"CreditRefundRecord",
			[
				"id",
				"purchaseId",
				"statementId",
				"amount",
				"creditDate",
				"policy",
				"cancellationEligible",
				"deletedAt",
				"createdAt",
				"updatedAt",
				"externalId",
				"time",
			],
			[
				r.id,
				r.purchaseId,
				r.creditStatementId,
				r.amountCents / 100,
				r.creditDate,
				r.policy,
				r.cancellationEligible,
				r.deletedAt,
				r.createdAt,
				r.updatedAt,
				r.externalId ?? null,
				r.time ?? null,
			],
		);
		await upsert(
			query,
			"CreditEntryReference",
			["id", "purchaseId", "refundId", "requiresRefundReview"],
			[r.id, r.purchaseId, r.id, false],
		);
	}
	for (const ch of book.charges) {
		await upsert(
			query,
			"CreditStatementCharge",
			[
				"id",
				"statementId",
				"description",
				"amount",
				"chargeDate",
				"time",
				"externalId",
				"isSettled",
				"settledByPurchaseId",
			],
			[
				ch.id,
				ch.statementId,
				ch.description,
				ch.amountCents / 100,
				ch.chargeDate,
				ch.time,
				ch.externalId,
				ch.isSettled,
				ch.settledByPurchaseId,
			],
		);
		await upsert(query, "CreditEntryReference", ["id", "chargeId"], [ch.id, ch.id]);
	}
	for (const ch of previous.charges.filter(ch => !book.charges.some(next => next.id === ch.id)))
		await query(`DELETE FROM "CreditStatementCharge" WHERE "id" = $1`, [ch.id]);
	const history = async (id: string, field: string, before: unknown, after: unknown) => {
		if (JSON.stringify(before) === JSON.stringify(after)) return;
		await query(
			`INSERT INTO "CreditPurchaseHistory" ("creditPurchaseId","field","oldValue","newValue") VALUES ($1,$2,$3,$4)`,
			[
				id,
				field,
				before === null || before === undefined
					? null
					: typeof before === "object"
						? JSON.stringify(before)
						: String(before),
				after === null || after === undefined
					? null
					: typeof after === "object"
						? JSON.stringify(after)
						: String(after),
			],
		);
	};
	for (const p of book.purchases) {
		const old = previous.purchases.find(row => row.id === p.id);
		if (!old) continue;
		for (const field of [
			"description",
			"storeName",
			"purchaseDate",
			"time",
			"categoryId",
			"tagIds",
			"feeAmount",
			"feeDescription",
			"debtSplitRule",
			"cashbackAmount",
		] as const)
			await history(p.id, field, old[field], p[field]);
		await history(p.id, "totalAmount", old.totalAmountCents / 100, p.totalAmountCents / 100);
		await history(p.id, "installments", old.installmentAmountsCents.length, p.installmentAmountsCents.length);
	}
	for (const i of book.installments) {
		const old = previous.installments.find(row => row.id === i.id);
		if (old) await history(i.id, "installmentAmount", old.amountCents / 100, i.amountCents / 100);
	}
	for (const r of book.refunds) {
		const old = previous.refunds.find(row => row.id === r.id);
		if (!old) continue;
		await history(r.id, "refundAmount", old.amountCents / 100, r.amountCents / 100);
		await history(r.id, "refundDate", old.creditDate, r.creditDate);
		await history(r.id, "deletedAt", old.deletedAt, r.deletedAt);
	}
	for (const p of book.purchases) {
		if (
			JSON.stringify(previous.purchases.find(old => old.id === p.id)?.debtSplitRule) !==
				JSON.stringify(p.debtSplitRule) ||
			previous.purchases.find(old => old.id === p.id)?.totalAmountCents !== p.totalAmountCents
		)
			await replaceDebtSplit({
				amount: p.totalAmountCents / 100,
				split: p.debtSplitRule ?? null,
				target: { creditPurchaseId: p.id },
				userId: book.card.userId,
			});
		if (p.purchaseDate <= currentDateKey())
			await syncPurchaseDebtEvent({
				creditPurchaseId: p.id,
				date: p.purchaseDate,
				description: p.description,
				totalAmount: p.totalAmountCents / 100,
				userId: book.card.userId,
			});
		await syncRefundDebtEvents(query, book, p);
	}
	const replay = replayCreditBook(book);
	for (const s of replay.statements.filter(s => book.statements.some(old => old.id === s.id)))
		await query(
			`UPDATE "CreditCardStatement" SET "totalAmount" = $1, "paidAmount" = $2, "isPaid" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $4`,
			[Number(s.totalAmount) + s.chargesAmount, s.paidAmount, s.isPaid, s.id],
		);
}

export async function mutateCreditBook<T>(
	userId: string,
	cardId: string,
	mutation: (book: CreditBook, query: RawQuery) => T | Promise<T>,
	asOf = currentDateKey(),
) {
	return withRawTransaction(async query => {
		const book = await loadCreditBook(query, userId, cardId, true);
		const previous = structuredClone(book);
		try {
			const result = await mutation(book, query);
			materializeBookInstallments(book, asOf);
			await saveCreditBook(query, book, previous);
			return result;
		} catch (error) {
			if (error instanceof RangeError) throw new HttpException(error.message, 400);
			throw error;
		}
	});
}

export async function recalculateCreditCardDueDates(
	userId: string,
	cardId: string,
	previousCard: { dueDay: number; statementDay: number; workingDueDate: boolean },
) {
	await mutateCreditBook(userId, cardId, book => {
		for (const statement of book.statements)
			statement.dueDate = recalculateStatementDueDate(
				book.card,
				statement.statementDate,
				statement.dueDate,
				previousCard,
			);
	});
}

export async function transferCreditBookPurchase<T>(
	userId: string,
	sourceCardId: string,
	destinationCardId: string,
	purchaseId: string,
	mutation: (book: CreditBook, query: RawQuery) => T | Promise<T>,
) {
	return withRawTransaction(async query => {
		const ids = [sourceCardId, destinationCardId].sort();
		const books: CreditBook[] = [];
		for (const id of ids) books.push(await loadCreditBook(query, userId, id, true));
		const source = books[ids.indexOf(sourceCardId)]!;
		const destination = books[ids.indexOf(destinationCardId)]!;
		const sourceBefore = structuredClone(source);
		const destinationBefore = structuredClone(destination);
		try {
			const purchase = moveBookPurchase(source, destination, purchaseId);
			const result = await mutation(destination, query);
			materializeBookInstallments(source);
			materializeBookInstallments(destination);
			await query(
				`UPDATE "CreditPurchaseRecord" SET "creditCardId"=$1 WHERE "id"=$2 AND "userId"=$3 AND "creditCardId"=$4`,
				[destinationCardId, purchase.id, userId, sourceCardId],
			);
			await saveCreditBook(query, source, sourceBefore, new Set([purchase.id]));
			await saveCreditBook(query, destination, destinationBefore);
			await query(
				`INSERT INTO "CreditPurchaseHistory" ("creditPurchaseId","field","oldValue","newValue") VALUES ($1,'creditCardId',$2,$3)`,
				[purchase.id, sourceCardId, destinationCardId],
			);
			return result;
		} catch (error) {
			if (error instanceof RangeError) throw new HttpException(error.message, 400);
			throw error;
		}
	});
}

export async function readCreditBook(userId: string, cardId: string) {
	return withRawTransaction(query => loadCreditBook(query, userId, cardId));
}
export async function presentCreditBook(book: CreditBook) {
	const tags = await getTagsByEntity(
		tagEntityType.creditPurchase,
		book.purchases.map(p => p.id),
	);
	const splits = await getDebtSplitReturns(
		"creditPurchaseId",
		book.purchases.map(p => ({ amount: p.totalAmountCents / 100, id: p.id })),
	);
	return creditBookEntries(book).map(row => ({
		...row,
		debtSplit: row.purchaseId ? (splits.get(row.purchaseId) ?? null) : null,
		tags: row.purchaseId ? (tags.get(row.purchaseId) ?? []) : [],
	}));
}
export function resolveBookPurchase(book: CreditBook, id: string) {
	return bookPurchase(book, book.installments.find(i => i.id === id)?.purchaseId ?? id);
}
export { distributePurchaseCents, newBookPurchase, queryRaw };
