import type { CreditCardStatement, CreditPurchase } from "@/lib/api";

export interface StatementActionRecovery {
	cardId: string;
	statement: CreditCardStatement;
	purchase?: CreditPurchase;
	action: "dates" | "anticipate" | "refinance" | "refund" | "delete-refund";
	data?: {
		totalAmount?: number;
		installments?: number;
		purchaseDate?: string;
		time?: string | null;
		sourceTime?: string | null;
		amount?: number;
		anticipationDate?: string;
		discount?: number;
		installmentNumbers?: number[];
		date?: string;
		canceledInstallmentNumbers?: number[];
		statementDate?: string;
		dueDate?: string;
		manualTotalAmount?: string;
	};
}
