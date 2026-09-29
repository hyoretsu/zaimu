export type CreditCardImportProvider = "MERCADO_PAGO" | "BRADESCO" | "INTER" | "NUBANK" | "PICPAY";

export interface CreditCardStatementPurchase {
	/** Original date token before provider-specific installment date inference. */
	statementPurchaseDate?: string;
	currentInstallment: number;
	description: string;
	/** Index of the purchase offset by this financing, when the statement contains both. */
	financingSourceIndex?: number;
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
