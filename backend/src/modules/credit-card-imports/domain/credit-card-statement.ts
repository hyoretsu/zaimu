export type CreditCardImportProvider = "MERCADO_PAGO" | "BRADESCO" | "INTER" | "NUBANK" | "PICPAY";

export interface CreditCardStatementPurchase {
	currentInstallment: number;
	description: string;
	installmentAmount: number;
	installments: number;
	purchaseDate: string;
	totalAmount: number;
}

export interface CreditCardStatement {
	dueDate: string;
	provider: CreditCardImportProvider;
	purchases: CreditCardStatementPurchase[];
	statementDate: string;
}
