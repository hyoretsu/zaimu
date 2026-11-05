export type StatementProvider =
	"MERCADO_PAGO" | "NUBANK" | "BANCO_DO_BRASIL" | "INTER" | "PICPAY" | "BANCO_PAN" | "BTG_PACTUAL";
export type StatementTransactionType = "EXPENSE" | "INCOME" | "YIELD";

export interface StatementTransaction {
	amount: number;
	balanceAfter?: number;
	date: string;
	description: string;
	externalId?: string;
	time?: string;
	type: StatementTransactionType;
}

export interface Statement {
	periodEnd?: string;
	periodStart?: string;
	provider: StatementProvider;
	transactions: StatementTransaction[];
}
