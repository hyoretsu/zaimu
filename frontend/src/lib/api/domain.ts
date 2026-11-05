export type {
	CategoryPageReturn as CategoryPage,
	CategoryReturn as Category,
	CreditCardImportCreateResultReturn as CreditCardImportCreateResult,
	CreditCardImportItemReturn as CreditCardImportItem,
	CreditCardImportPurchaseDuplicateReturn as CreditCardImportPurchaseDuplicate,
	CreditCardImportReturn as CreditCardImport,
	CreditCardImportSummaryReturn as CreditCardImportSummary,
	CreditCardReturn as CreditCard,
	CreditCardStatementDetailReturn as CreditCardStatementDetail,
	CreditCardStatementPageReturn as CreditCardStatementPage,
	CreditCardStatementReturn as CreditCardStatement,
	CreditPurchaseEditDetailsReturn as CreditPurchaseEditDetails,
	DashboardPeriodReturn as DashboardPeriod,
	DebtEventReturn as DebtEvent,
	DebtInvitationPreviewReturn as DebtInvitationPreview,
	DebtInvitationReturn as DebtInvitation,
	DebtLedgerReturn as DebtLedger,
	DebtPersonReturn as DebtPerson,
	DebtSplitInputReturn as DebtSplitInput,
	DebtSplitReturn as DebtSplit,
	DebtSplitSummaryReturn as DebtSplitSummary,
	EarlyPayoffReturn as EarlyPayoff,
	FinancialAccountYieldHolidayReturn as FinancialAccountYieldHoliday,
	FinancialAccountYieldRateHistoryReturn as FinancialAccountYieldRateHistory,
	FinancialAccountYieldReturn as FinancialAccountYield,
	FinancialInstitutionReturn as FinancialInstitution,
	FinancialInstitutionYieldPolicyReturn as FinancialInstitutionYieldPolicy,
	FinancialInstitutionYieldRuleReturn as FinancialInstitutionYieldRule,
	LoanPaymentPageReturn as LoanPaymentPage,
	LoanPaymentReturn as LoanPayment,
	LoanReturn as Loan,
	OpenFinanceBindingReturn as OpenFinanceBinding,
	OpenFinanceConfigurationReturn as OpenFinanceConfiguration,
	OpenFinanceConnectionReturn as OpenFinanceConnection,
	OpenFinanceSyncStatusReturn as OpenFinanceSyncStatus,
	PaymentSuggestionReturn as PaymentSuggestion,
	RewardsAccountReturn as RewardsAccount,
	StoredDebtEventReturn as StoredDebtEvent,
	StorePageReturn as StorePage,
	StoreReturn as Store,
	TagReturn as Tag,
	TransactionImportCreateResultReturn as TransactionImportCreateResult,
	TransactionImportDuplicateReasonReturn as TransactionImportDuplicateReason,
	TransactionImportDuplicateReturn as TransactionImportDuplicate,
	TransactionImportItemReturn as TransactionImportItem,
	TransactionImportReturn as TransactionImport,
	TransactionImportSummaryReturn as TransactionImportSummary,
	TransactionImportTransferSuggestionReturn as TransactionImportTransferSuggestion,
	UserReturn as User,
} from "./generated/api";

import type { FinancialAccountReturn } from "./generated/api";

/** Fields persisted only under the local storage identity. */
export interface LocalFinancialAccountFields {
	balanceAdjustments?: import("../balance-adjustment").BalanceAdjustment[];
	historicalYieldSettings?: import("@zaimu/finance/projected-yield").HistoricalYieldSettings | null;
	legacyYieldCalendar?: import("@zaimu/finance/projected-yield").LegacyYieldCalendar | null;
	yieldLots?: import("@zaimu/finance/yield-tax").YieldLot[];
	/** Balance after the tax deferred to redemption; null when no tax is deferred. */
	netBalance?: number | null;
	/** Numeric rewards ledger, never a monetary holding or quote input. */
	pointsBalance?: number;
	legacyInstitutionId?: string | null;
	legacyInstitutionYieldPolicies?: import("./generated/api").FinancialInstitutionYieldPolicyReturn[];
}

export type FinancialAccount = Omit<FinancialAccountReturn, "currency" | "balance" | "assets"> &
	LocalFinancialAccountFields & {
		yieldCurrency: string | null;
		assets: import("../account-assets").AccountAsset[];
	};

export type FinancialAccountOption = import("./generated/api").GetFinancialAccountsOptionsResponse[number];

export type FinancialFee = import("./generated/api").FinancialFeeReturn;
export type CreditPurchase = import("./generated/api").CreditPurchaseReturn;
export type Transaction = import("./generated/api").TransactionReturn;

export type Dashboard = import("./generated/api").GetDashboardResponse;
