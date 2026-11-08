import { creditBookEntries, moneyCents } from "@zaimu/finance/credit-book";
import { currencyScale } from "@zaimu/finance/money";
import { mutateCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { HttpException } from "~/shared/errors";
import { withRawTransaction } from "~/shared/infra/sql";
import { associateImportTax, readImportTaxes } from "../domain/import-purchase-taxes";
import { rememberImportIdentity } from "./import-identities";
import { cleanupItemTags } from "./import-service";

// Raw queries return the stored JSON as is, and legacy rows hold the double-encoded default string "[]".
function readMetadataMissing(value: unknown): string[] {
	const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
	return Array.isArray(parsed) ? (parsed as string[]) : [];
}

export async function associateImportedTax(
	userId: string,
	importId: string,
	taxId: string,
	purchaseId: string,
	reviewed?: { name?: string; amount?: number; resolvedMetadata?: string[] },
) {
	return withRawTransaction(async query => {
		const [batch] = await query<{
			status: string;
			creditCardId: string;
			statementDate: Date;
			dueDate: Date;
		}>(`SELECT * FROM "CreditCardImport" WHERE "id"=$1 AND "userId"=$2 FOR UPDATE`, [importId, userId]);
		if (batch?.status !== "PENDING") throw new HttpException("Importação pendente não encontrada", 409);
		const items = await query<{
			id: string;
			description: string;
			externalId: string;
			taxes: unknown;
			taxSourceExternalIds: string[];
			totalAmount: string;
			installmentAmount: string;
			isStatementCharge: boolean;
			installments: number;
			metadataMissing: unknown;
		}>(`SELECT * FROM "CreditCardImportItem" WHERE "creditCardImportId"=$1 AND "id"=ANY($2) FOR UPDATE`, [
			importId,
			[taxId, purchaseId],
		]);
		const tax = items.find(item => item.id === taxId);
		const unresolvedTaxMetadata = readMetadataMissing(tax?.metadataMissing).filter(
			field => !reviewed?.resolvedMetadata?.includes(field),
		);
		const purchase = items.find(item => item.id === purchaseId);
		if (tax && !purchase) {
			if (
				tax.installments !== 1 ||
				Number(tax.installmentAmount) <= 0 ||
				readImportTaxes(tax.taxes).length ||
				unresolvedTaxMetadata.length
			)
				throw new HttpException("Selecione um lançamento positivo à vista sem impostos", 400);
			await mutateCreditBook(userId, batch.creditCardId, book => {
				const target = book.purchases.find(p => p.id === purchaseId);
				const row = creditBookEntries(book).find(
					row =>
						row.purchaseId === purchaseId &&
						!row.isRefund &&
						!row.isStatementCharge &&
						!row.isSettled &&
						book.statements.some(
							s =>
								s.id === row.statementId &&
								s.statementDate === batch.statementDate.toISOString().slice(0, 10) &&
								s.dueDate === batch.dueDate.toISOString().slice(0, 10),
						),
				);
				if (!target || !row || (target.fees?.length ?? 0) >= 20)
					throw new HttpException("Selecione uma compra da mesma fatura", 400);
				const name = (reviewed?.name ?? tax.description).trim().slice(0, 100);
				const amount = reviewed?.amount ?? Number(tax.installmentAmount);
				if (!name || !Number.isFinite(amount) || amount <= 0)
					throw new HttpException("Informe um imposto válido", 400);
				const cents = moneyCents(amount, 1, book.card.currency);
				const amounts = [...target.installmentAmountsCents];
				amounts[row.currentInstallment - 1]! += cents;
				target.originalAmount ??= target.totalAmountCents / currencyScale(book.card.currency);
				target.fees = [...(target.fees ?? []), { amount, name, type: "FIXED" }];
				target.totalAmountCents += cents;
				target.installmentAmountsCents = amounts;
				for (const installment of book.installments.filter(
					i => i.purchaseId === target.id && i.number === row.currentInstallment,
				)) {
					installment.amountCents += cents;
					installment.hasImportedAmount = true;
				}
				target.updatedAt = new Date().toISOString();
			});
			await rememberImportIdentity(query, tax.externalId, purchaseId);
			await cleanupItemTags([tax.id]);
			await query(`DELETE FROM "CreditCardImportItem" WHERE "id"=$1`, [tax.id]);
			return;
		}
		if (
			!tax ||
			!purchase ||
			tax.id === purchase.id ||
			purchase.isStatementCharge ||
			Number(purchase.installmentAmount) <= 0 ||
			tax.installments !== 1 ||
			Number(tax.installmentAmount) <= 0 ||
			readImportTaxes(tax.taxes).length ||
			readImportTaxes(purchase.taxes).length >= 20 ||
			unresolvedTaxMetadata.length ||
			readMetadataMissing(purchase.metadataMissing).length
		)
			throw new HttpException("Selecione um imposto e uma compra da mesma fatura", 400);
		const result = associateImportTax(
			{
				installmentAmount: Number(purchase.installmentAmount),
				taxes: readImportTaxes(purchase.taxes),
				totalAmount: Number(purchase.totalAmount),
			},
			{
				amount: reviewed?.amount ?? Number(tax.installmentAmount),
				name: (reviewed?.name ?? tax.description).slice(0, 100),
			},
		);
		await query(
			`UPDATE "CreditCardImportItem" SET "totalAmount"=$2, "installmentAmount"=$3, "taxes"=$4::json, "taxSourceExternalIds"=$5::json, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
			[
				purchase.id,
				result.totalAmount,
				result.installmentAmount,
				JSON.stringify(result.taxes),
				JSON.stringify([...purchase.taxSourceExternalIds, tax.externalId]),
			],
		);
		await cleanupItemTags([tax.id]);
		await query(`DELETE FROM "CreditCardImportItem" WHERE "id"=$1`, [tax.id]);
	});
}
