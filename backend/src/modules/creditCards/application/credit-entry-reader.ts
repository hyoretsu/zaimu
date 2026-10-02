import { queryRaw } from "~/shared/infra/sql";

/** Read-only projection; all mutations use normalized-credit-book. */
export interface CreditReadRow extends Record<string, unknown> {
	id: string;
	purchaseId: string | null;
	entryKind: "INSTALLMENT" | "REFUND" | "CHARGE";
	userId: string;
	creditCardId: string;
	statementId: string;
	description: string;
	storeName: string | null;
	purchaseDate: Date;
	occurrenceDate: Date;
	time: string | null;
	totalAmount: number;
	installments: number;
	currentInstallment: number;
	installmentAmount: number;
	hasImportedAmount: boolean;
	parentId: string | null;
	isRefund: boolean;
	isStatementCharge: boolean;
	refundOfPurchaseId: string | null;
	isSettled: boolean;
	settledByPurchaseId: string | null;
	feeAmount: number | null;
	feeDescription: string | null;
	refinancingFeeAmount: number | null;
	categoryId: string | null;
	cashbackAccountId: string | null;
	cashbackAmount: number | null;
	cashbackYieldPeriod: "MONTHLY" | "YEARLY" | null;
	cashbackYieldReferencePercentage: number | null;
	cashbackYieldReferenceRate: number | null;
	recurrenceId: string | null;
	recurrenceOccurrenceDate: Date | null;
	externalId: string | null;
	createdAt: Date;
	updatedAt: Date;
}
export const readCreditEntries = (cardId: string) =>
	queryRaw<CreditReadRow>(`SELECT * FROM "CreditEntry" WHERE "creditCardId"=$1`, [cardId]);
