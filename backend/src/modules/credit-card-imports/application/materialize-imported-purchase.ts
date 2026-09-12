import { addMonths } from "date-fns";
import { replaceEntityTags, tagEntityType } from "~/modules/categories/application/tag-assignments";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst } from "~/shared/infra/sql";

interface ImportedPurchaseInput {
	categoryId: null | string;
	description: string;
	externalId: string;
	installmentAmount: number;
	installments: number;
	purchaseDate: Date;
	storeName: null | string;
	tagIds: string[];
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
	let rootId: string | null = null;
	for (let currentInstallment = 1; currentInstallment <= input.installments; currentInstallment++) {
		const occurrenceDate = addMonths(input.purchaseDate, currentInstallment - 1);
		const statement = await getOrCreateStatement(card, occurrenceDate);
		const purchase = await queryFirst(
			db.sql.public.CreditPurchase.insert([
				{
					categoryId: input.categoryId ?? undefined,
					...(currentInstallment === 1 && card.cashbackAccountId && card.cashbackRate
						? {
								cashbackAccountId: card.cashbackAccountId,
								cashbackAmount: String((input.totalAmount * card.cashbackRate) / 100),
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
					installmentAmount: String(input.installmentAmount),
					installments: input.installments,
					...(rootId && { parentId: rootId }),
					purchaseDate: input.purchaseDate,
					statementId: statement.id,
					storeName: input.storeName ?? undefined,
					totalAmount: String(input.totalAmount),
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
				totalAmount: functions.raw`${fields.totalAmount} + ${String(input.installmentAmount)}`.returns(
					"pg/numeric@1",
				),
				updatedAt: new Date(),
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
