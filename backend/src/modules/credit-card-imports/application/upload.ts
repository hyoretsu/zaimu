import { synchronizeImportedStatementDates } from "@zaimu/finance/credit-book";
import { statementEntryKind } from "@zaimu/finance/credit-card";
import { distributePurchaseCents } from "@zaimu/finance/credit-purchase";
import { hasMatchingInstallmentSum } from "@zaimu/finance/credit-refund";
import { importedAnticipation, withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { t } from "elysia";
import {
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { type CreditReadRow, readCreditEntries } from "~/modules/creditCards/application/credit-entry-reader";
import { mutateCreditBook, readCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { getDebtSplitInput, replaceDebtSplit } from "~/modules/debts/application/debt-splits";
import { createCreditCardBatch } from "~/modules/transaction-imports/application/import-batches";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryRaw, queryRows, withRawTransaction } from "~/shared/infra/sql";
import { combineAnticipationRefunds } from "../domain/anticipation-refunds";
import { confirmedImportRoots } from "../domain/confirmed-import-roots";
import { assignCreditCardPurchaseExternalIds } from "../domain/credit-card-import-identity";
import { parseCreditCardStatementPdf } from "../domain/credit-card-statement-parser";
import { existingImportRoots } from "../domain/existing-import-roots";
import { existingPurchaseImportValues } from "../domain/existing-purchase-import-values";
import { filterZeroValuePurchases } from "../domain/filter-zero-value-purchases";
import { withFinancingSource, withFinancingTarget } from "../domain/financing-source-reference";
import {
	resolveImportStatementDates,
	synchronizeNextImportedStatement,
} from "../domain/resolve-import-statement-dates";
import { findPendingImport, selectNewImportPurchases } from "../domain/select-new-import-purchases";
import { getImportReturn, markStatementAsFullySynced } from "./import-service";

const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
const importItemTagEntityType = "CREDIT_CARD_IMPORT_ITEM";

export const CreateCreditCardImportBody = t.Object({
	creditCardId: t.String({ maxLength: 36, minLength: 1 }),
	file: t.File(),
	password: t.Optional(t.String({ maxLength: 128 })),
	provider: t.Union([
		t.Literal("MERCADO_PAGO"),
		t.Literal("BRADESCO"),
		t.Literal("INTER"),
		t.Literal("NUBANK"),
		t.Literal("PICPAY"),
		t.Literal("WILL_BANK"),
	]),
	statementId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
});

export async function createUploadedCreditCardImport(
	userId: string,
	body: typeof CreateCreditCardImportBody.static,
	guard?: () => Promise<void>,
	complete?: (result: { importId: string | null; ignoredCount: number }) => Promise<void>,
) {
	if (body.file.type !== "application/pdf" && !body.file.name.toLowerCase().endsWith(".pdf"))
		throw new HttpException("Envie um arquivo PDF", 400);
	const fileBytes = new Uint8Array(await body.file.arrayBuffer());
	if (fileBytes.length < 5 || new TextDecoder().decode(fileBytes.slice(0, 5)) !== "%PDF-")
		throw new HttpException("Envie um PDF válido", 400);
	const parsedStatement = await parseCreditCardStatementPdf(fileBytes.buffer, body.provider, body.password);
	return withRawTransaction(async () => {
		await guard?.();
		const result = await (async () => {
			const resolvedDates = await mutateCreditBook(userId, body.creditCardId, book => {
				const dates = resolveImportStatementDates(parsedStatement, book, body.statementId);
				if (body.statementId) synchronizeImportedStatementDates(book, dates, body.statementId);
				if (parsedStatement.nextStatementDate)
					synchronizeNextImportedStatement(
						book,
						parsedStatement.nextStatementDate,
						dates.statementDate,
					);
				return dates;
			});
			const statement = { ...parsedStatement, ...resolvedDates };
			const reportedPreviousBalance =
				statement.reportedPreviousBalance ??
				statement.purchases.find(purchase =>
					/^(saldo\s+(anterior|financiado)|saldo devedor anterior)/i.test(
						purchase.description.trim(),
					),
				)?.installmentAmount;
			const importBook = await readCreditBook(userId, body.creditCardId);
			const purchases = combineAnticipationRefunds(
				assignCreditCardPurchaseExternalIds(
					filterZeroValuePurchases(
						statement.purchases.filter(
							purchase => statementEntryKind(purchase.description) !== "BALANCE",
						),
					),
					body.creditCardId,
				),
				importBook.purchases.map(p => ({
					id: p.id,
					installmentAmountsCents: p.installmentAmountsCents,
					purchaseDate: p.purchaseDate,
					totalAmount: p.totalAmountCents / 100,
				})),
			);
			const [existing, pending] = await Promise.all([
				queryRaw<CreditReadRow>(
					`SELECT * FROM "CreditEntry" WHERE "creditCardId"=$1 AND "externalId"=ANY($2)`,
					[body.creditCardId, purchases.map(p => p.externalId)],
				),
				queryRaw<{ creditCardImportId: string; currentInstallment: number; externalId: string }>(
					`SELECT i."creditCardImportId", i."currentInstallment", i."externalId"
      FROM "CreditCardImportItem" i JOIN "CreditCardImport" b ON b."id"=i."creditCardImportId"
      WHERE b."creditCardId"=$1 AND b."status"='PENDING'
      UNION ALL
      SELECT i."creditCardImportId", 1 AS "currentInstallment", json_array_elements_text(i."taxSourceExternalIds") AS "externalId"
      FROM "CreditCardImportItem" i JOIN "CreditCardImport" b ON b."id"=i."creditCardImportId"
      WHERE b."creditCardId"=$1 AND b."status"='PENDING'`,
					[body.creditCardId],
				),
			]);
			const existingCardEntries = await readCreditEntries(body.creditCardId);
			const anticipatedPlans = purchases.some(
				p => p.installmentAmount > 0 && importedAnticipation(p.description),
			)
				? new Map(
						(await readCreditBook(userId, body.creditCardId, false)).purchases.map(p => [
							p.id,
							p.installmentAmountsCents,
						]),
					)
				: new Map<string, number[]>();
			const identities = await queryRaw<{ externalId: string; purchaseId: string }>(
				`SELECT i."externalId", i."purchaseId" FROM "CreditPurchaseImportIdentity" i
				 JOIN "CreditPurchaseRecord" p ON p."id"=i."purchaseId"
				 WHERE p."creditCardId"=$1 AND p."userId"=$2 AND i."externalId"=ANY($3::text[])`,
				[body.creditCardId, userId, purchases.map(p => p.externalId)],
			);
			const existingRoots = new Map([
				...confirmedImportRoots(purchases, existingCardEntries),
				...identities.map(identity => [identity.externalId, identity.purchaseId] as const),
				...existingImportRoots(existing),
			]);
			const existingRootIds = [...new Set(existingRoots.values())];
			const existingInstallments = existingCardEntries.filter(p =>
				existingRootIds.includes(p.purchaseId ?? p.id),
			);
			const newPurchases = selectNewImportPurchases(
				purchases,
				existingRoots,
				existingInstallments,
				pending,
			);
			for (const purchase of newPurchases) {
				if (
					purchase.installmentAmount < 0 ||
					!importedAnticipation(purchase.description) ||
					purchase.reconciledCreditPurchaseId
				)
					continue;
				const matches = existingCardEntries.filter(
					entry =>
						!entry.parentId &&
						!entry.isRefund &&
						!entry.isStatementCharge &&
						entry.installments === purchase.installments &&
						dateKey(entry.purchaseDate) <= purchase.purchaseDate.slice(0, 10) &&
						hasMatchingInstallmentSum(
							anticipatedPlans.get(entry.id) ??
								distributePurchaseCents(
									Math.round(Number(entry.totalAmount) * 100),
									entry.installments,
								),
							importedAnticipation(purchase.description)!.reduce(
								(sum, part) => sum + part.amountCents,
								0,
							),
						) &&
						entry.description.normalize("NFKC").trim().toLocaleLowerCase("pt-BR") ===
							withoutImportedAnticipation(purchase.description)
								.normalize("NFKC")
								.trim()
								.toLocaleLowerCase("pt-BR") &&
						Math.abs(Number(entry.totalAmount) - purchase.totalAmount) <= 1,
				);
				if (matches.length === 1) {
					purchase.reconciledCreditPurchaseId = matches[0]!.id;
					purchase.purchaseDate = dateKey(matches[0]!.purchaseDate);
					purchase.totalAmount = Number(matches[0]!.totalAmount);
				}
			}
			const statementId = (
				await queryRaw<{ id: string }>(
					`SELECT "id" FROM "CreditCardStatement" WHERE "creditCardId"=$1 AND "statementDate"=$2::date LIMIT 1`,
					[body.creditCardId, statement.statementDate],
				)
			)[0]?.id;
			for (let index = newPurchases.length - 1; index >= 0; index--) {
				const purchase = newPurchases[index]!;
				const anticipated = importedAnticipation(purchase.description);
				if (
					purchase.installmentAmount < 0 ||
					!anticipated ||
					!purchase.reconciledCreditPurchaseId ||
					!statementId
				)
					continue;
				const rootId = purchase.reconciledCreditPurchaseId;
				if (
					anticipated.every(installment =>
						existingCardEntries.some(
							entry =>
								(entry.id === rootId || entry.parentId === rootId) &&
								entry.currentInstallment === installment.number &&
								entry.hasImportedAmount &&
								entry.statementId === statementId &&
								Math.round(Number(entry.installmentAmount) * 100) === installment.amountCents,
						),
					)
				)
					newPurchases.splice(index, 1);
			}
			const ignoredCount = purchases.length - newPurchases.length;
			if (!newPurchases.length) {
				const pendingImportId = findPendingImport(
					selectNewImportPurchases(purchases, existingRoots, existingInstallments, []),
					pending,
				);
				if (pendingImportId) {
					return { creditCardImport: await getImportReturn(userId, pendingImportId), ignoredCount };
				}
				await markStatementAsFullySynced({
					creditCardId: body.creditCardId,
					dueDate: new Date(`${statement.dueDate}T12:00:00`),
					statementDate: new Date(`${statement.statementDate}T12:00:00`),
				});
				return { creditCardImport: null, ignoredCount };
			}
			const creditCardImport = await createCreditCardBatch({
				creditCardId: body.creditCardId,
				dueDate: new Date(`${statement.dueDate}T12:00:00`),
				fileName: body.file.name.slice(0, 255),
				provider: statement.provider,
				reportedPreviousBalance:
					reportedPreviousBalance === undefined ? null : String(reportedPreviousBalance),
				statementDate: new Date(`${statement.statementDate}T12:00:00`),
				userId,
			});
			if (!creditCardImport) throw new HttpException("Não foi possível criar a importação", 500);
			await executeStatement(
				db.sql.public.CreditCardImportItem.insert(
					newPurchases.map(
						({ financingSourceExternalId, financingTargetExternalId, ...purchase }) => ({
							...purchase,
							creditCardImportId: creditCardImport.id,
							description: financingSourceExternalId
								? withFinancingSource(purchase.description, financingSourceExternalId)
								: financingTargetExternalId
									? withFinancingTarget(purchase.description, financingTargetExternalId)
									: purchase.description,
							installmentAmount: String(purchase.installmentAmount),
							isStatementCharge: statementEntryKind(purchase.description) === "CHARGE",
							purchaseDate: new Date(`${purchase.purchaseDate}T12:00:00`),
							...(purchase.reconciledCreditPurchaseId && {
								reconciledCreditPurchaseId: purchase.reconciledCreditPurchaseId,
							}),
							totalAmount: String(purchase.totalAmount),
						}),
					),
				).build(),
			);
			const reconciledItems = await queryRows(
				db.sql.public.CreditCardImportItem.select(
					"id",
					"description",
					"reconciledCreditPurchaseId",
					"totalAmount",
				)
					.where((fields, functions) =>
						functions.eq(fields.creditCardImportId, creditCardImport.id),
					)
					.build(),
			);
			const existingTags = await getTagsByEntity(
				tagEntityType.creditPurchase,
				reconciledItems.flatMap(item =>
					item.reconciledCreditPurchaseId ? [item.reconciledCreditPurchaseId] : [],
				),
			);
			for (const item of reconciledItems) {
				const original = existingCardEntries.find(
					entry => entry.id === item.reconciledCreditPurchaseId,
				);
				if (!original) continue;
				await executeStatement(
					db.sql.public.CreditCardImportItem.update(
						existingPurchaseImportValues(item.description, original),
					)
						.where((fields, functions) => functions.eq(fields.id, item.id))
						.build(),
				);
				await replaceEntityTags({
					entityIds: [item.id],
					entityType: importItemTagEntityType,
					tagIds: (existingTags.get(original.id) ?? []).map(tag => tag.id),
				});
				await replaceDebtSplit({
					amount: Number(
						importedAnticipation(item.description) ? original.totalAmount : item.totalAmount,
					),
					split: (await getDebtSplitInput({ creditPurchaseId: original.id })) ?? null,
					target: { creditCardImportItemId: item.id },
					userId,
				});
			}
			return { creditCardImport: await getImportReturn(userId, creditCardImport.id), ignoredCount };
		})();
		await complete?.({
			ignoredCount: result.ignoredCount,
			importId: result.creditCardImport?.id ?? null,
		});
		return result;
	});
}
