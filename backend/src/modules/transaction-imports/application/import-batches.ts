import { HttpException } from "~/shared/errors";
import { db, nullableNumeric, queryFirst } from "~/shared/infra/sql";
export async function createTransactionBatch(input: {
	id?: string;
	userId: string;
	financialAccountId: string;
	provider:
		| "MEUPLUGGY"
		| "MERCADO_PAGO"
		| "NUBANK"
		| "GENERIC"
		| "BANCO_DO_BRASIL"
		| "INTER"
		| "PICPAY"
		| "BANCO_PAN"
		| "BTG_PACTUAL";
	fileName: string;
	periodStart?: Date | null;
	periodEnd?: Date | null;
}) {
	const row = await queryFirst(
		db.sql.public.TransactionImport.insert([
			{
				...input,
				periodEnd:
					input.periodEnd == null ? input.periodEnd : input.periodEnd.toISOString().slice(0, 10),
				periodStart:
					input.periodStart == null
						? input.periodStart
						: input.periodStart.toISOString().slice(0, 10),
				updatedAt: new Date(),
			},
		])
			.returning("id")
			.build(),
	);
	if (!row) throw new HttpException("Não foi possível criar a importação", 500);
	return row;
}
export async function createCreditCardBatch(input: {
	userId: string;
	creditCardId: string;
	provider: "MEUPLUGGY" | "MERCADO_PAGO" | "NUBANK" | "BRADESCO" | "INTER" | "PICPAY" | "WILL_BANK";
	fileName: string;
	statementDate: Date;
	dueDate: Date;
	reportedPreviousBalance?: string | null;
}) {
	const row = await queryFirst(
		db.sql.public.CreditCardImport.insert([
			{
				...input,
				dueDate: input.dueDate.toISOString().slice(0, 10),
				reportedPreviousBalance:
					input.reportedPreviousBalance === undefined
						? undefined
						: nullableNumeric(input.reportedPreviousBalance),
				statementDate: input.statementDate.toISOString().slice(0, 10),
				updatedAt: new Date(),
			},
		])
			.returning("id")
			.build(),
	);
	if (!row) throw new HttpException("Não foi possível criar a importação", 500);
	return row;
}
