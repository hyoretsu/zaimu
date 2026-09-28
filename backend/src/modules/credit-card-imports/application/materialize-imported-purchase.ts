import { statementEntryKind } from "@zaimu/finance/credit-card";
import { replaceEntityTags, tagEntityType } from "~/modules/categories/application/tag-assignments";
import {
	getImportedInstallmentAmounts,
	preserveImportedInstallmentAmounts,
	sumInstallmentAmounts,
} from "~/modules/creditCards/domain/installment-amounts";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";
import { hasCompatibleInstallmentAmount } from "../domain/credit-card-import-reconciliation";
import { withoutFinancingReferences } from "../domain/financing-source-reference";
import { importedInstallmentDates } from "../domain/imported-installment-dates";

interface ImportedPurchaseInput {
	isStatementCharge?: boolean;
	categoryId: null | string;
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

async function getOrCreateStatement(card: CardSnapshot, statementDate: Date, dueDate: Date) {
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
	const importedDescription = withoutFinancingReferences(input.description);
	const isStatementCharge = input.isStatementCharge ?? statementEntryKind(importedDescription) === "CHARGE";
	if (isStatementCharge && input.installments !== 1)
		throw new HttpException("Encargos não permitem parcelamento automático", 400);
	if (input.installmentAmount < 0) {
		if (input.installments !== 1 || input.totalAmount !== input.installmentAmount)
			throw new HttpException("Crédito da fatura com valor inválido", 400);
		if (input.existingRootId) return input.existingRootId;
		const statement = await getOrCreateStatement(card, input.statementDate, input.dueDate);
		const refund = await queryFirst(
			db.sql.public.CreditPurchase.insert([
				{
					categoryId: input.categoryId ?? undefined,
					currentInstallment: 1,
					description: importedDescription,
					externalId: input.externalId,
					hasImportedAmount: true,
					installmentAmount: String(input.installmentAmount),
					installments: 1,
					isRefund: true,
					isStatementCharge,
					purchaseDate: input.purchaseDate,
					statementId: statement.id,
					storeName: input.storeName ?? undefined,
					totalAmount: String(input.totalAmount),
					userId: card.userId,
				},
			])
				.returning("id")
				.build(),
		);
		if (!refund) throw new HttpException("Não foi possível registrar o crédito da fatura", 500);
		await executeStatement(
			db.sql.public.CreditCardStatement.update((fields, functions) => ({
				totalAmount: functions.raw`${fields.totalAmount} + ${String(input.installmentAmount)}`.returns(
					"pg/numeric@1",
				),
				updatedAt: functions.raw`CURRENT_TIMESTAMP`.returns("pg/timestamp@1"),
			}))
				.where((fields, functions) => functions.eq(fields.id, statement.id))
				.build(),
		);
		if (input.tagIds.length)
			await replaceEntityTags({
				entityIds: [refund.id],
				entityType: tagEntityType.creditPurchase,
				tagIds: input.tagIds,
			});
		return refund.id;
	}
	const financedFee = importedDescription.match(/^(FIN .+?) · IOF R\$ ([\d.]+,\d{2})$/u);
	const description = financedFee?.[1] ?? importedDescription;
	const feeAmount = financedFee ? Number(financedFee[2]!.replace(/\./g, "").replace(",", ".")) : null;
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
		const observed = currentInstallment === input.currentInstallment;
		const existing = existingByInstallment.get(currentInstallment);
		if (existing) {
			const previousInstallmentAmount = Number(existing.installmentAmount);
			const installmentAmountDifference = installmentAmount - previousInstallmentAmount;
			const observedStatement = observed
				? await getOrCreateStatement(card, input.statementDate, input.dueDate)
				: null;
			const movedStatement = observedStatement && observedStatement.id !== existing.statementId;
			await executeStatement(
				db.sql.public.CreditPurchase.update({
					...((isStatementCharge || financedFee) && { cashbackAccountId: null, cashbackAmount: null }),
					...(currentInstallment === 1 &&
						!isStatementCharge &&
						!financedFee &&
						existing.cashbackAmount !== null && {
							cashbackAmount: String(
								Number(
									(Number(existing.cashbackAmount) * totalAmount) / Number(existing.totalAmount),
								).toFixed(4),
							),
						}),
					categoryId: input.categoryId,
					description,
					isStatementCharge,
					...(financedFee &&
						currentInstallment === input.currentInstallment && {
							feeAmount: feeAmount ? String(feeAmount) : null,
							feeDescription: feeAmount ? "IOF do parcelamento" : null,
						}),
					...(currentInstallment === 1 && { externalId: input.externalId }),
					hasImportedAmount: existing.hasImportedAmount || currentInstallment === input.currentInstallment,
					installmentAmount: String(installmentAmount),
					installments: input.installments,
					purchaseDate: input.purchaseDate,
					...(movedStatement && { statementId: observedStatement.id }),
					storeName: input.storeName,
					time: input.time,
					totalAmount: String(totalAmount),
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, existing.id))
					.build(),
			);
			if (movedStatement) {
				await executeStatement(
					db.sql.public.CreditCardStatement.update((fields, functions) => ({
						totalAmount: functions.raw`${fields.totalAmount} - ${String(previousInstallmentAmount)}`.returns(
							"pg/numeric@1",
						),
						updatedAt: functions.raw`CURRENT_TIMESTAMP`.returns("pg/timestamp@1"),
					}))
						.where((fields, functions) => functions.eq(fields.id, existing.statementId))
						.build(),
				);
				await executeStatement(
					db.sql.public.CreditCardStatement.update((fields, functions) => ({
						totalAmount: functions.raw`${fields.totalAmount} + ${String(installmentAmount)}`.returns(
							"pg/numeric@1",
						),
						updatedAt: functions.raw`CURRENT_TIMESTAMP`.returns("pg/timestamp@1"),
					}))
						.where((fields, functions) => functions.eq(fields.id, observedStatement.id))
						.build(),
				);
			} else if (installmentAmountDifference)
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
		const dates = importedInstallmentDates(
			input.statementDate,
			input.dueDate,
			input.currentInstallment,
			currentInstallment,
		);
		const statement = await getOrCreateStatement(card, dates.statementDate, dates.dueDate);
		const purchase = await queryFirst(
			db.sql.public.CreditPurchase.insert([
				{
					categoryId: input.categoryId ?? undefined,
					isStatementCharge,
					...(currentInstallment === 1 &&
					!isStatementCharge &&
					!financedFee &&
					card.cashbackAccountId &&
					card.cashbackRate
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
					description,
					...(financedFee &&
						currentInstallment === input.currentInstallment &&
						feeAmount && {
							feeAmount: String(feeAmount),
							feeDescription: "IOF do parcelamento",
						}),
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
					userId: card.userId,
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
	// New purchases have no tag assignments yet. A reconciliation can target
	// existing purchases, so it must still clear assignments when needed.
	if (input.tagIds.length || input.existingRootId)
		await replaceEntityTags({
			entityIds: createdIds,
			entityType: tagEntityType.creditPurchase,
			tagIds: input.tagIds,
		});
	return rootId;
}
