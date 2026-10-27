import { HttpException } from "~/shared/errors";
import { withRawTransaction } from "~/shared/infra/sql";
import { associateImportTax, readImportTaxes } from "../domain/import-purchase-taxes";
import { cleanupItemTags } from "./import-service";

export async function associateImportedTax(
	userId: string,
	importId: string,
	taxId: string,
	purchaseId: string,
	reviewed?: { name?: string; amount?: number },
) {
	return withRawTransaction(async query => {
		const [batch] = await query<{ status: string }>(
			`SELECT "status" FROM "CreditCardImport" WHERE "id"=$1 AND "userId"=$2 FOR UPDATE`,
			[importId, userId],
		);
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
		const purchase = items.find(item => item.id === purchaseId);
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
			(tax.metadataMissing as string[]).length ||
			(purchase.metadataMissing as string[]).length
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
