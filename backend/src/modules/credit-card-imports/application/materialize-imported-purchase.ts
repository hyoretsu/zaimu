import {
	addBookRefund,
	type BookPurchase,
	ensureBookStatement,
	moneyCents,
} from "@zaimu/finance/credit-book";
import { distributePurchaseCents, installmentOccurrenceDate } from "@zaimu/finance/credit-purchase";
import { importedAnticipation, withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { mutateCreditBook, newBookPurchase } from "~/modules/creditCards/application/normalized-credit-book";
import { HttpException } from "~/shared/errors";
import { withoutFinancingReferences } from "../domain/financing-source-reference";
import {
	assertImportedInstallmentChronology,
	importedInstallmentDates,
} from "../domain/imported-installment-dates";

interface ImportedPurchaseInput {
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
	return mutateCreditBook(card.userId, card.id, async (book, query) => {
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
				amountCents: moneyCents(input.installmentAmount, 1),
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
			throw new HttpException(
				error instanceof Error ? error.message : "Calendário de parcelas inválido",
				409,
			);
		}
		const existing = book.purchases.find(p => p.id === input.existingRootId) ?? duplicate;
		const anticipated = importedAnticipation(input.description);
		if (anticipated && !existing) throw new HttpException("Vincule a antecipação à compra original", 409);
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
			known.get(input.currentInstallment) !== moneyCents(input.installmentAmount, 1)
		)
			throw new HttpException("Valor importado já registrado para esta parcela", 409);
		known.set(input.currentInstallment, moneyCents(input.installmentAmount, 1));
		const totalCents = anticipated
			? known.size === input.installments
				? [...known.values()].reduce((sum, amount) => sum + amount, 0)
				: existing!.totalAmountCents
			: moneyCents(input.totalAmount, 1);
		const amounts = distributePurchaseCents(totalCents, input.installments, known);
		const p =
			existing ??
			newBookPurchase(book, {
				cashbackAccountId: card.cashbackAccountId,
				cashbackAmount:
					card.cashbackAccountId && card.cashbackRate
						? Number(((input.totalAmount * card.cashbackRate) / 100).toFixed(4))
						: null,
				cashbackYieldPeriod: card.cashbackYieldPeriod,
				cashbackYieldReferencePercentage: card.cashbackYieldReferencePercentage,
				cashbackYieldReferenceRate: card.cashbackYieldReferenceRate,
				description: withoutImportedAnticipation(withoutFinancingReferences(input.description)),
				externalId: input.externalId,
				installmentAmountsCents: amounts,
				installments: input.installments,
				purchaseDate: input.purchaseDate.toISOString().slice(0, 10),
				totalAmount: input.totalAmount,
			});
		Object.assign(
			p,
			anticipated
				? {
						installmentAmountsCents: amounts,
						installmentImportedNumbers: [...known.keys()],
						totalAmountCents: totalCents,
						updatedAt: new Date().toISOString(),
					}
				: {
						debtSplitRule: input.debtSplitRule === undefined ? p.debtSplitRule : input.debtSplitRule,
						description: withoutImportedAnticipation(withoutFinancingReferences(input.description)),
						externalId: input.externalId,
						installmentAmountsCents: amounts,
						installmentImportedNumbers: [...known.keys()],
						purchaseDate: input.purchaseDate.toISOString().slice(0, 10),
						storeName: input.storeName,
						tagIds: input.tagIds,
						time: input.time,
						totalAmountCents: totalCents,
						updatedAt: new Date().toISOString(),
					},
		);
		p.installmentStatementDates = amounts.map((_, index) => {
			const previous = existing?.installmentStatementDates?.[index];
			if (anticipated?.some(i => i.number === index + 1))
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
		for (const i of book.installments.filter(i => i.purchaseId === p.id))
			i.amountCents = amounts[i.number - 1]!;
		return p.id;
	});
}
