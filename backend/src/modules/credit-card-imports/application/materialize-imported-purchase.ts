import { addMonths } from "date-fns";
import { replaceEntityTags, tagEntityType } from "~/modules/categories/application/tag-assignments";
import {
	getImportedInstallmentAmounts,
	preserveImportedInstallmentAmounts,
	sumInstallmentAmounts,
} from "~/modules/creditCards/domain/installment-amounts";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";
import { hasCompatibleInstallmentAmount } from "../domain/credit-card-import-reconciliation";

interface ImportedPurchaseInput {
	categoryId: null | string;
	currentInstallment: number;
	description: string;
	externalId: string;
	existingRootId: null | string;
	installmentAmount: number;
	installments: number;
	purchaseDate: Date;
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
}

function getStatementDates(card: Pick<CardSnapshot, "dueDay" | "statementDay">, purchaseDate: Date) {
	const statementMonth =
		purchaseDate.getDate() > card.statementDay ? addMonths(purchaseDate, 1) : purchaseDate;
	const statementDate = new Date(statementMonth.getFullYear(), statementMonth.getMonth(), card.statementDay);
	const dueDate = new Date(statementMonth.getFullYear(), statementMonth.getMonth(), card.dueDay);
	if (dueDate <= statementDate) dueDate.setMonth(dueDate.getMonth() + 1);
	return { dueDate, statementDate };
}

async function getOrCreateStatement(card: CardSnapshot, purchaseDate: Date) {
	const { dueDate, statementDate } = getStatementDates(card, purchaseDate);
	let statement = await queryFirst(
		db.sql.public.CreditCardStatement.select("id")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.creditCardId, card.id),
					functions.eq(fields.statementDate, statementDate),
				),
			)
			.limit(1)
			.build(),
	);
	if (!statement)
		statement = await queryFirst(
			db.sql.public.CreditCardStatement.insert([
				{ creditCardId: card.id, dueDate, statementDate, totalAmount: "0" },
			])
				.returning("id")
				.build(),
		);
	if (!statement) throw new HttpException("Não foi possível criar a fatura do cartão", 500);
	return statement;
}

export async function materializeImportedPurchase(card: CardSnapshot, input: ImportedPurchaseInput) {
	const createdIds: string[] = [];
	const importedInstallmentAmounts = getImportedInstallmentAmounts(input);
	let rootId = input.existingRootId;
	const existingPurchases = rootId
		? await queryRows(
				db.sql.public.CreditPurchase.select(
					"cashbackAmount",
					"currentInstallment",
					"hasImportedAmount",
					"id",
					"installmentAmount",
					"statementId",
					"totalAmount",
				)
					.where((fields, functions) =>
						functions.or(functions.eq(fields.id, rootId!), functions.eq(fields.parentId, rootId!)),
					)
					.build(),
			)
		: [];
	const existingByInstallment = new Map(
		existingPurchases.map(purchase => [purchase.currentInstallment, purchase]),
	);
	const installmentAmounts = preserveImportedInstallmentAmounts(
		importedInstallmentAmounts,
		existingPurchases.map(purchase => ({
			currentInstallment: purchase.currentInstallment,
			hasImportedAmount: purchase.hasImportedAmount,
			installmentAmount: Number(purchase.installmentAmount),
		})),
	);
	const totalAmount = sumInstallmentAmounts(installmentAmounts);
	if (
		existingPurchases.some(
			purchase =>
				purchase.currentInstallment > input.installments ||
				(!purchase.hasImportedAmount &&
					!hasCompatibleInstallmentAmount(
						installmentAmounts[purchase.currentInstallment - 1]!,
						purchase.installmentAmount,
						input.installments,
					)),
		)
	)
		throw new HttpException("As parcelas existentes não correspondem à compra importada", 409);
	for (let currentInstallment = 1; currentInstallment <= input.installments; currentInstallment++) {
		const installmentAmount = installmentAmounts[currentInstallment - 1]!;
		const existing = existingByInstallment.get(currentInstallment);
		if (existing) {
			const previousInstallmentAmount = Number(existing.installmentAmount);
			const installmentAmountDifference = installmentAmount - previousInstallmentAmount;
			await executeStatement(
				db.sql.public.CreditPurchase.update({
					...(currentInstallment === 1 &&
						existing.cashbackAmount !== null && {
							cashbackAmount: String(
								Number(
									(Number(existing.cashbackAmount) * totalAmount) / Number(existing.totalAmount),
								).toFixed(4),
							),
						}),
					categoryId: input.categoryId,
					description: input.description,
					...(currentInstallment === 1 && { externalId: input.externalId }),
					hasImportedAmount: existing.hasImportedAmount || currentInstallment === input.currentInstallment,
					installmentAmount: String(installmentAmount),
					installments: input.installments,
					purchaseDate: input.purchaseDate,
					storeName: input.storeName,
					time: input.time,
					totalAmount: String(totalAmount),
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, existing.id))
					.build(),
			);
			if (installmentAmountDifference)
				await executeStatement(
					db.sql.public.CreditCardStatement.update((fields, functions) => ({
						totalAmount:
							functions.raw`${fields.totalAmount} + ${String(installmentAmountDifference)}`.returns(
								"pg/numeric@1",
							),
						updatedAt: functions.raw`CURRENT_TIMESTAMP`.returns("pg/timestamp@1"),
					}))
						.where((fields, functions) => functions.eq(fields.id, existing.statementId))
						.build(),
				);
			createdIds.push(existing.id);
			continue;
		}
		const occurrenceDate = addMonths(input.purchaseDate, currentInstallment - 1);
		const statement = await getOrCreateStatement(card, occurrenceDate);
		const purchase = await queryFirst(
			db.sql.public.CreditPurchase.insert([
				{
					categoryId: input.categoryId ?? undefined,
					...(currentInstallment === 1 && card.cashbackAccountId && card.cashbackRate
						? {
								cashbackAccountId: card.cashbackAccountId,
								cashbackAmount: String((totalAmount * card.cashbackRate) / 100),
								cashbackYieldPeriod: card.cashbackYieldPeriod ?? undefined,
								cashbackYieldReferencePercentage:
									card.cashbackYieldReferencePercentage === null
										? undefined
										: String(card.cashbackYieldReferencePercentage),
								cashbackYieldReferenceRate:
									card.cashbackYieldReferenceRate === null
										? undefined
										: String(card.cashbackYieldReferenceRate),
							}
						: {}),
					currentInstallment,
					description: input.description,
					...(currentInstallment === 1 && { externalId: input.externalId }),
					hasImportedAmount: currentInstallment === input.currentInstallment,
					installmentAmount: String(installmentAmount),
					installments: input.installments,
					...(rootId && { parentId: rootId }),
					purchaseDate: input.purchaseDate,
					statementId: statement.id,
					storeName: input.storeName ?? undefined,
					time: input.time ?? undefined,
					totalAmount: String(totalAmount),
				},
			])
				.returning("id")
				.build(),
		);
		if (!purchase) throw new HttpException("Não foi possível criar a compra", 500);
		rootId ??= purchase.id;
		createdIds.push(purchase.id);
		await executeStatement(
			db.sql.public.CreditCardStatement.update((fields, functions) => ({
				totalAmount: functions.raw`${fields.totalAmount} + ${String(installmentAmount)}`.returns(
					"pg/numeric@1",
				),
				updatedAt: functions.raw`CURRENT_TIMESTAMP`.returns("pg/timestamp@1"),
			}))
				.where((fields, functions) => functions.eq(fields.id, statement.id))
				.build(),
		);
	}
	await replaceEntityTags({
		entityIds: createdIds,
		entityType: tagEntityType.creditPurchase,
		tagIds: input.tagIds,
	});
	return rootId;
}
