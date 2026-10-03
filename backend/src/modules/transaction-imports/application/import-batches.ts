import { HttpException } from "~/shared/errors";
import { db, queryFirst } from "~/shared/infra/sql";
export async function createTransactionBatch(input: {
	userId: string;
	financialAccountId: string;
	provider: "MEUPLUGGY" | "MERCADO_PAGO" | "NUBANK" | "GENERIC" | "BANCO_DO_BRASIL" | "INTER" | "PICPAY";
	fileName: string;
	periodStart?: Date | null;
	periodEnd?: Date | null;
}) {
	const row = await queryFirst(
		db.sql.public.TransactionImport.insert([{ ...input, updatedAt: new Date() }])
			.returning("id")
			.build(),
	);
	if (!row) throw new HttpException("Não foi possível criar a importação", 500);
	return row;
}
export async function createCreditCardBatch(input: {
	userId: string;
	creditCardId: string;
	provider: "MEUPLUGGY" | "MERCADO_PAGO" | "NUBANK" | "BRADESCO" | "INTER" | "PICPAY";
	fileName: string;
	statementDate: Date;
	dueDate: Date;
	reportedPreviousBalance?: string | null;
}) {
	const row = await queryFirst(
		db.sql.public.CreditCardImport.insert([{ ...input, updatedAt: new Date() }])
			.returning("id")
			.build(),
	);
	if (!row) throw new HttpException("Não foi possível criar a importação", 500);
	return row;
}
