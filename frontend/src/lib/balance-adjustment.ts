export interface BalanceAdjustment {
	currency?: string;
	balance: number;
	calculatedBalance: number;
	createdAt: string;
	date: string;
	financialAccountId: string;
	id: string;
	name: string | null;
}
