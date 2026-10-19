import {
	addBookRefund,
	type BookPurchase,
	bookRefinancingLinks,
	type CreditBook,
	ensureBookStatement,
	moneyCents,
	refinanceBookPurchase,
	resizePurchaseCashback,
	synchronizeImportedStatementDates,
} from "@zaimu/finance/credit-book";
import { distributePurchaseCents, installmentOccurrenceDate } from "@zaimu/finance/credit-purchase";
import {
	hasCompleteImportedPlan,
	importedAnticipation,
	withoutImportedAnticipation,
} from "@zaimu/finance/imported-anticipation";
import { rewardSnapshot } from "~/modules/creditCards/application/cashback-snapshot";
import { mutateCreditBook, newBookPurchase } from "~/modules/creditCards/application/normalized-credit-book";
import type { RawQuery } from "~/modules/creditCards/application/normalized-statement-replay";
import { HttpException } from "~/shared/errors";
import { withoutFinancingReferences } from "../domain/financing-source-reference";
import {
	assertImportedInstallmentChronology,
	importedInstallmentDates,
} from "../domain/imported-installment-dates";
import { importedPurchaseTotalCents } from "../domain/imported-purchase-total";

interface ImportedPurchaseInput {
	id?: string;
	allowBankCorrection?: boolean;
	debtSplitRule?: BookPurchase["debtSplitRule"];
	isStatementCharge?: boolean;
	currentInstallment: number;
	description: string;
	dueDate: Date;
	externalId: string;
	existingRootId: null | string;
	installmentAmount: number;
	installments: number;
	purchaseDate: Date;
	statementDate: Date;
	storeName: null | string;
	tagIds: string[];
	time: null | string;
	totalAmount: number;
}

interface CardSnapshot {
	cashbackAccountId: null | string;
	cashbackRate: null | number;
	cashbackYieldPeriod: "MONTHLY" | "YEARLY" | null;
	cashbackYieldReferencePercentage: null | number;
	cashbackYieldReferenceRate: null | number;
	dueDay: number;
	id: string;
	statementDay: number;
	userId: string;
}

export async function materializeImportedPurchase(card: CardSnapshot, input: ImportedPurchaseInput) {
	return mutateCreditBook(card.userId, card.id, (book, query) =>
		materializePurchaseInBook(book, query, card, input),
	);
}

/** Persist a complete approval batch once, before consumers read CreditEntry. */
export async function materializeImportedPurchases(card: CardSnapshot, inputs: ImportedPurchaseInput[]) {
	if (!inputs.length) return [];
	return mutateCreditBook(card.userId, card.id, async (book, query) => {
		const ids: string[] = [];
		for (const input of inputs) ids.push(await materializePurchaseInBook(book, query, card, input));
		return ids;
	});
}

async function materializePurchaseInBook(
	book: CreditBook,
	query: RawQuery,
	card: CardSnapshot,
	input: ImportedPurchaseInput,
) {
	synchronizeImportedStatementDates(book, {
		dueDate: input.dueDate.toISOString().slice(0, 10),
		statementDate: input.statementDate.toISOString().slice(0, 10),
	});
	const duplicate = book.purchases.find(p => p.externalId === input.externalId);
	const refundDuplicate = await query<{ id: string }>(
		`SELECT r."id" FROM "CreditRefundRecord" r JOIN "CreditPurchaseRecord" p ON p."id"=r."purchaseId" WHERE r."externalId"=$1 AND p."creditCardId"=$2`,
		[input.externalId, card.id],
	);
	if (input.installmentAmount < 0) {
		if (refundDuplicate[0]) return refundDuplicate[0].id;
		const [reference] = input.existingRootId
			? await query<{ purchaseId: string | null }>(
					`SELECT "purchaseId" FROM "CreditEntryReference" WHERE "id"=$1`,
					[input.existingRootId],
				)
			: [];
		const source = book.purchases.find(p => p.id === (reference?.purchaseId ?? input.existingRootId));
		if (!source) throw new HttpException("Crédito exige revisão e vínculo com compra original", 409);
		const r = addBookRefund(book, source.id, {
			amount: Math.abs(input.installmentAmount),
			creditDate: input.purchaseDate.toISOString().slice(0, 10),
		});
		// External identity is saved after book persistence by the transaction wrapper below.
		r.externalId = input.externalId;
		r.time = input.time;
		return r.id;
	}
	if (input.isStatementCharge) {
		const existing = book.charges.find(ch => ch.externalId === input.externalId);
		if (existing) return existing.id;
		const s = ensureBookStatement(book, input.purchaseDate.toISOString().slice(0, 10), {
			dueDate: input.dueDate.toISOString().slice(0, 10),
			statementDate: input.statementDate.toISOString().slice(0, 10),
		});
		const id = crypto.randomUUID();
		book.charges.push({
			amountCents: moneyCents(input.installmentAmount, 1, book.card.currency),
			chargeDate: input.purchaseDate.toISOString().slice(0, 10),
			description: input.description,
			externalId: input.externalId,
			id,
			isSettled: false,
			settledByPurchaseId: null,
			statementId: s.id,
			time: input.time,
		});
		return id;
	}
	try {
		assertImportedInstallmentChronology(input.purchaseDate, input.statementDate, input.currentInstallment);
	} catch (error) {
		throw new HttpException(error instanceof Error ? error.message : "Calendário de parcelas inválido", 409);
	}
	let existing = duplicate ?? book.purchases.find(p => p.id === input.existingRootId);
	const refinancing =
		existing && existing.installmentAmountsCents.length !== input.installments && !duplicate;
	if (refinancing) {
		const previousIds = new Set(book.purchases.map(p => p.id));
		refinanceBookPurchase(book, existing!.id, {
			installments: input.installments,
			purchaseDate: input.purchaseDate.toISOString().slice(0, 10),
			totalAmount: input.totalAmount,
		});
		existing = book.purchases.find(p => !previousIds.has(p.id));
		if (!existing) throw new HttpException("Não foi possível criar o reparcelamento", 409);
		existing.externalId = input.externalId;
	}
	const anticipated = importedAnticipation(input.description)?.map(item => ({
		...item,
		amountCents: moneyCents(item.amountCents / 100, 1, book.card.currency),
	}));
	if (anticipated && !existing && !hasCompleteImportedPlan(input.description, input.installments))
		throw new HttpException("Vincule a antecipação à compra original", 409);
	const known = new Map(
		book.installments
			.filter(i => i.purchaseId === existing?.id && i.hasImportedAmount)
			.map(i => [i.number, i.amountCents]),
	);
	if (anticipated?.some(i => i.number > input.installments))
		throw new HttpException("Antecipação incompatível com o parcelamento", 409);
	for (const i of anticipated ?? []) {
		if (known.has(i.number) && known.get(i.number) !== i.amountCents)
			throw new HttpException("Valor importado já registrado para esta parcela", 409);
		known.set(i.number, i.amountCents);
	}
	if (
		known.has(input.currentInstallment) &&
		known.get(input.currentInstallment) !== moneyCents(input.installmentAmount, 1, book.card.currency) &&
		!input.allowBankCorrection
	)
		throw new HttpException("Valor importado já registrado para esta parcela", 409);
	known.set(input.currentInstallment, moneyCents(input.installmentAmount, 1, book.card.currency));
	const totalCents = importedPurchaseTotalCents(
		anticipated && existing
			? existing.totalAmountCents
			: moneyCents(input.totalAmount, 1, book.card.currency),
		input.installments,
		known,
	);
	const amounts = distributePurchaseCents(
		totalCents,
		input.installments,
		known,
		book.card.installmentRemainderOnFirst,
	);
	const [source] = input.id
		? await query<{ currency: string; originalAmount: number }>(
				`SELECT "snapshot"->>'currency' AS currency, abs(COALESCE(("snapshot"->>'totalAmount')::numeric,("snapshot"->>'amount')::numeric)) AS "originalAmount" FROM "OpenFinanceRecord" WHERE "reviewItemId"=$1 LIMIT 1`,
				[input.id],
			)
		: [];
	const originalMoney =
		source && Number(source.originalAmount) > 0
			? {
					currency: source.currency,
					exchangeRate: input.totalAmount / Number(source.originalAmount),
					originalAmount: Number(source.originalAmount),
				}
			: {};
	const p =
		existing ??
		newBookPurchase(book, {
			...originalMoney,
			...(await rewardSnapshot(
				card,
				input.totalAmount,
				book.card.currency ?? "BRL",
				input.purchaseDate.toISOString().slice(0, 10),
				card.userId,
			)),
			description: withoutImportedAnticipation(withoutFinancingReferences(input.description)),
			externalId: input.externalId,
			installmentAmountsCents: amounts,
			installments: input.installments,
			purchaseDate: input.purchaseDate.toISOString().slice(0, 10),
			totalAmount: input.totalAmount,
		});
	const relation = bookRefinancingLinks(book).get(p.id);
	const original = relation?.refinancedFromPurchaseId
		? book.purchases.find(row => row.id === relation.refinancingOriginalPurchaseId)
		: undefined;
	const previousTotal = p.totalAmountCents;
	Object.assign(
		p,
		anticipated && existing
			? {
					installmentAmountsCents: amounts,
					installmentImportedNumbers: [...known.keys()],
					totalAmountCents: totalCents,
					updatedAt: new Date().toISOString(),
				}
			: {
					debtSplitRule: input.debtSplitRule === undefined ? p.debtSplitRule : input.debtSplitRule,
					description: original
						? `Parcelamento - ${original.description}`
						: withoutImportedAnticipation(withoutFinancingReferences(input.description)),
					externalId: existing?.externalId ?? input.externalId,
					installmentAmountsCents: amounts,
					installmentImportedNumbers: [...known.keys()],
					purchaseDate: input.purchaseDate.toISOString().slice(0, 10),
					storeName: input.storeName,
					tagIds: original ? [...original.tagIds] : input.tagIds,
					time: input.time,
					totalAmountCents: totalCents,
					updatedAt: new Date().toISOString(),
				},
	);
	resizePurchaseCashback(p, previousTotal);
	p.installmentStatementDates = amounts.map((_, index) => {
		const previous = existing?.installmentStatementDates?.[index];
		if (anticipated?.some(i => i.number === index + 1))
			return {
				dueDate: input.dueDate.toISOString().slice(0, 10),
				statementDate: input.statementDate.toISOString().slice(0, 10),
			};
		if (index + 1 === input.currentInstallment)
			return {
				dueDate: input.dueDate.toISOString().slice(0, 10),
				statementDate: input.statementDate.toISOString().slice(0, 10),
			};
		if (previous) return previous;
		const dates = importedInstallmentDates(
			input.statementDate,
			input.dueDate,
			input.currentInstallment,
			index + 1,
		);
		return {
			dueDate: dates.dueDate.toISOString().slice(0, 10),
			statementDate: dates.statementDate.toISOString().slice(0, 10),
		};
	});
	for (
		let number = 1;
		number <= Math.max(input.currentInstallment, ...(anticipated?.map(i => i.number) ?? []));
		number++
	) {
		const occurrence = book.installments.find(i => i.purchaseId === p.id && i.number === number);
		const s = ensureBookStatement(
			book,
			installmentOccurrenceDate(p.purchaseDate, number),
			p.installmentStatementDates[number - 1]!,
		);
		if (occurrence) {
			occurrence.statementId = s.id;
			occurrence.amountCents = amounts[number - 1]!;
			occurrence.hasImportedAmount = known.has(number);
		} else
			book.installments.push({
				amountCents: amounts[number - 1]!,
				hasImportedAmount: known.has(number),
				id: number === 1 ? p.id : crypto.randomUUID(),
				number,
				occurrenceDate: installmentOccurrenceDate(p.purchaseDate, number),
				purchaseId: p.id,
				settledByPurchaseId: null,
				statementId: s.id,
			});
	}
	for (const i of book.installments.filter(i => i.purchaseId === p.id)) {
		i.amountCents = amounts[i.number - 1]!;
		if (refinancing) {
			i.occurrenceDate = installmentOccurrenceDate(p.purchaseDate, i.number);
			i.statementId = ensureBookStatement(
				book,
				i.occurrenceDate,
				p.installmentStatementDates[i.number - 1]!,
			).id;
		}
	}
	return p.id;
}
