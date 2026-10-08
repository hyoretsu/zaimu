import { fetchWithAuth } from "./dataService";
export interface FinancialFee {
	name: string;
	amount: number;
	type: "FIXED" | "PERCENTAGE";
}
// Types
export interface User {
	id: string;
	email: string;
	name?: string;
	createdAt: string;
}

export interface FinancialAccount {
	currency?: string;
	isPrimary?: boolean;
	isDefaultForStatements?: boolean;
	id: string;
	isHidden?: boolean;
	userId: string;
	name: string | null;
	type: "CHECKING" | "SAVINGS" | "INVESTMENT" | "CASH" | "CREDIT_CARD" | "REWARDS";
	balance: number | null;
	institutionId?: string | null;
	institution?: FinancialInstitution | null;
	createdAt: string;
	updatedAt: string;
	yieldPeriod?: "MONTHLY" | "YEARLY" | null;
	yieldFixedRate?: number | null;
	yieldReferencePercentage?: number | null;
	yieldReferenceType?: "CDI" | "SELIC" | null;
	yieldTaxRate?: number | null;
	yieldRateHistories?: FinancialAccountYieldRateHistory[];
	creditCard?: CreditCard;
	rewardsAccount?: RewardsAccount;
}

export interface FinancialAccountYieldRateHistory {
	effectiveDate: string;
	yieldPeriod?: "MONTHLY" | "YEARLY" | null;
	yieldFixedRate?: number | null;
	yieldReferencePercentage?: number | null;
	yieldReferenceType?: "CDI" | "SELIC" | null;
	yieldTaxRate?: number | null;
}

export interface FinancialAccountYieldHoliday {
	id: string;
	date: string;
}

export interface FinancialAccountYield {
	accountName?: string;
	amount: number | null;
	date: string;
	financialAccountId: string;
	id: string;
	isExcluded: boolean;
	isHidden?: boolean;
	kind: "AUTOMATIC" | "MANUAL";
	origin?: "SYSTEM" | "USER";
	time?: string | null;
}

export interface RewardsAccount {
	conversionCurrency?: string;
	id: string;
	financialAccountId: string;
	kind: "POINTS" | "CASHBACK";
	initialBalance: number;
	conversionPoints?: number | null;
	conversionAmount?: number | null;
}

export interface FinancialInstitution {
	currency?: string;
	id: string;
	name: string;
	yieldPolicies?: FinancialInstitutionYieldPolicy[];
}
export interface FinancialInstitutionYieldPolicy {
	currency?: string;
	effectiveDate: string;
	rules: FinancialInstitutionYieldRule[];
	yieldPeriod?: "MONTHLY" | "YEARLY" | null;
	yieldTaxRate?: number | null;
}
export interface FinancialInstitutionYieldRule {
	upToBalance?: number | null;
	yieldFixedRate?: number | null;
	yieldReferencePercentage?: number | null;
	yieldReferenceType?: "CDI" | "SELIC" | null;
}

export interface StorePage {
	items: Store[];
	hasMore: boolean;
	nextCursor: string | null;
}

export interface Store {
	id: string;
	name: string;
	userId: string;
}

export type DebtSplitInput =
	| {
			mode: "SHARES";
			ownerShares: null | number;
			participants: Array<{ debtPersonId: string; description?: string; shares: number }>;
	  }
	| {
			mode: "PERCENTAGE";
			ownerIncluded: boolean;
			remainderDebtPersonId?: string;
			participants: Array<{ debtPersonId: string; description?: string; percentage: number }>;
	  }
	| {
			mode: "FIXED";
			ownerIncluded: boolean;
			remainderDebtPersonId?: string;
			participants: Array<{ debtPersonId: string; description?: string; fixedAmount: number }>;
	  };

export type DebtSplit =
	| {
			mode: "SHARES";
			ownerAmount: number;
			ownerShares: null | number;
			participants: Array<{
				amount: number;
				debtPersonId: string;
				debtPersonName: string;
				description?: string;
				shares: number;
			}>;
	  }
	| {
			mode: "PERCENTAGE";
			ownerAmount: number;
			ownerIncluded: boolean;
			remainderDebtPersonId?: string;
			participants: Array<{
				amount: number;
				debtPersonId: string;
				debtPersonName: string;
				description?: string;
				percentage: number;
			}>;
	  }
	| {
			mode: "FIXED";
			ownerAmount: number;
			ownerIncluded: boolean;
			remainderDebtPersonId?: string;
			participants: Array<{
				amount: number;
				debtPersonId: string;
				debtPersonName: string;
				description?: string;
				fixedAmount: number;
			}>;
	  };

export interface CreditCard {
	currency?: string;
	pendingRefundReviewCount?: number;
	paymentAccountId?: string | null;
	paymentSuggestionsEnabled?: boolean;
	id: string;
	financialAccountId: string;
	creditLimit: number;
	securityDeposit?: number | null;
	excludeFromTotals: boolean;
	ignoreStatementsBefore?: string | null;
	statementDay: number;
	dueDay: number;
	workingDueDate: boolean;
	cashbackAccountId?: string | null;
	cashbackRate?: number | null;
	cashbackYieldPeriod?: "MONTHLY" | "YEARLY" | null;
	cashbackYieldReferencePercentage?: number | null;
	cashbackYieldReferenceRate?: number | null;
	accountName?: string | null;
	currentStatement: CreditCardStatement | null;
	limit: {
		availableLimit: number;
		effectiveLimit: number;
		temporaryCredit: number;
		usedLimit: number;
	};
}

export interface DebtSplitSummary {
	ownerAmount: number;
	participants: Array<{ amount: number; debtPersonName: string }>;
}

export interface Transaction {
	conversionSource?: "MANUAL" | "DAILY" | null;
	bookingCurrency?: string;
	destinationAmount?: number | null;
	destinationCurrency?: string | null;
	paymentAmount?: number | null;
	paymentCurrency?: string | null;
	currency?: string;
	originalAmount?: number | null;
	exchangeRate?: number | null;
	fees?: FinancialFee[];
	debtSplitSummary?: DebtSplitSummary | null;
	entryKind?: "INSTALLMENT" | "REFUND" | "CHARGE";

	id: string;
	amount: number;
	date: string;
	time?: string | null;
	description?: string;
	isHidden?: boolean;
	debtSplit?: DebtSplit | null;
	storeName?: string | null;
	tagIds?: string[];
	feeDescription?: string | null;
	feeAmount?: number | null;
	refundOfPurchaseId?: string | null;
	isRefund?: boolean;
	hasRefund?: boolean;
	refund?: { amount: number; date: string; id: string };
	type: "INCOME" | "EXPENSE" | "REFUND" | "TRANSFER";
	recurrenceId?: string;
	recurrenceOccurrenceDate?: string;
	tags?: Tag[];
	originFinancialAccountId?: null | string;
	originAccountType?: FinancialAccount["type"] | null;
	originAccountRewardsKind?: RewardsAccount["kind"] | null;
	originName?: null | string;
	destinationFinancialAccountId?: null | string;
	destinationAccountType?: FinancialAccount["type"] | null;
	destinationAccountRewardsKind?: RewardsAccount["kind"] | null;
	destinationName?: null | string;
	createdAt: string;
	externalIds?: string[];
	isFullySynced?: boolean;
	isSynced?: boolean;
	creditCardId?: string;
	creditCardName?: string | null;
	paymentCreditCardId?: string;
	statementId?: string | null;
	creditCardStatementDate?: string | null;
	currentInstallment?: number;
	installmentAmount?: number;
	installments?: number;
	parentId?: string;
	source?: "CREDIT_CARD" | "FINANCIAL_ACCOUNT";
	sourceName?: string;
}

export type TransactionImportDuplicateReason = "DATE_AMOUNT" | "EXTERNAL_ID";

export interface TransactionImportDuplicate {
	id: string;
	amount: number;
	createdAt: string;
	paymentCreditCardId?: string | null;
	date: string;
	debtSplit?: DebtSplit | null;
	description?: string | null;
	destinationFinancialAccountId?: string | null;
	isHidden: boolean;
	originFinancialAccountId?: string | null;
	source: "IMPORT_ITEM" | "TRANSACTION";
	sourceImportId: string | null;
	storeName?: string | null;
	tagIds?: string[];
	tags: Tag[];
	time?: string | null;
	type: Transaction["type"] | "YIELD";
}

export interface TransactionImportTransferSuggestion {
	id: string;
	amount: number;
	createdAt: string;
	date: string;
	description?: string | null;
	debtSplit?: DebtSplit | null;
	destinationFinancialAccountId?: string | null;
	financialAccountId: string;
	isHidden: boolean;
	originFinancialAccountId?: string | null;
	storeName?: string | null;
	tagIds: string[];
	tags: Tag[];
	time?: string | null;
	type: Transaction["type"] | "YIELD";
}

export interface TransactionImportItem {
	requiresPaymentCard?: boolean;
	id: string;
	amount: number;
	balanceAfter?: number | null;
	paymentCreditCardId?: string | null;
	creditCardName?: string | null;
	creditCardStatementDate?: string | null;
	createdAt: string;
	date: string;
	debtSplit?: DebtSplit | null;
	description?: string | null;
	destinationFinancialAccountId?: string | null;
	duplicates: TransactionImportDuplicate[];
	duplicateReason: TransactionImportDuplicateReason | null;
	isDuplicateIgnored: boolean;
	isHidden: boolean;
	isReconciled: boolean;
	isSelected: boolean;
	originFinancialAccountId?: string | null;
	storeName?: string | null;
	tagIds: string[];
	tags: Tag[];
	time?: string | null;
	transferSuggestions: TransactionImportTransferSuggestion[];
	type: Transaction["type"] | "YIELD";
	updatedAt: string;
}

export interface TransactionImport {
	id: string;
	financialAccountId: string;
	fileName: string;
	hasMore: boolean;
	items: TransactionImportItem[];
	nextCursor: string | null;
	pendingItemCount: number;
	periodEnd?: string | null;
	periodStart?: string | null;
	provider: "MERCADO_PAGO" | "NUBANK" | "BANCO_DO_BRASIL" | "INTER" | "PICPAY";
	status: "PENDING" | "APPROVED";
	createdAt: string;
	updatedAt: string;
}

export interface TransactionImportSummary {
	id: string;
	fileName: string;
	pendingItemCount: number;
}

export interface TransactionImportCreateResult {
	ignoredCount: number;
	transactionImport: TransactionImport | null;
}

export interface CreditCardImportItem {
	metadataMissing?: string[];
	isStatementCharge?: boolean;
	id: string;
	createdAt: string;
	currentInstallment: number;
	debtSplit?: DebtSplit | null;
	description: string;
	duplicates: CreditCardImportPurchaseDuplicate[];
	installmentAmount: number;
	installments: number;
	isSelected: boolean;
	purchaseDate: string;
	reconciledCreditPurchaseId?: string | null;
	storeName?: string | null;
	tagIds: string[];
	tags: Tag[];
	time?: string | null;
	totalAmount: number;
	updatedAt: string;
}

export interface CreditCardImportPurchaseDuplicate {
	id: string;
	currentInstallment: number;
	debtSplit?: DebtSplit | null;
	description: string;
	existingInstallments: number;
	installmentAmount: number;
	installments: number;
	purchaseDate: string;
	storeName?: string | null;
	tagIds: string[];
	tags: Tag[];
	time?: string | null;
	totalAmount: number;
}

export interface CreditCardImport {
	previousBalanceCheck?: { reported: number; calculated: number; matches: boolean } | null;
	id: string;
	creditCardId: string;
	createdAt: string;
	dueDate: string;
	fileName: string;
	hasMore: boolean;
	items: CreditCardImportItem[];
	nextCursor: string | null;
	pendingItemCount: number;
	provider: "MEUPLUGGY" | "MERCADO_PAGO" | "BRADESCO" | "INTER" | "NUBANK" | "PICPAY";
	statementDate: string;
	status: "PENDING" | "APPROVED";
	updatedAt: string;
}

export interface CreditCardImportSummary {
	id: string;
	fileName: string;
	pendingItemCount: number;
}

export interface CreditCardImportCreateResult {
	creditCardImport: CreditCardImport | null;
	ignoredCount: number;
}

export interface Tag {
	id: string;
	name: string;
	color?: null | string;
	icon?: null | string;
}

export interface Category extends Tag {
	userId: string;
	parentId?: string | null;
}

export interface CategoryPage {
	items: Category[];
	hasMore: boolean;
	nextCursor: string | null;
}

export interface Loan {
	currency?: string;
	needsPaymentReview?: boolean;
	id: string;
	userId: string;
	lender: string;
	principalAmount: number;
	interestRate: number;
	totalInstallments: number;
	installmentAmount: number;
	dueDay: number;
	startDate: string;
	firstDueDate: string;
	description?: string;
	amortization: "PRICE" | "SAC";
	paidInstallments?: number;
	remainingInstallments?: number;
	remainingPrincipal?: number;
	totalPaid?: number;
}

export interface LoanPayment {
	accountAmount?: number | null;
	accountCurrency?: string | null;
	currency?: string;
	id: string;
	loanId: string;
	financialAccountId?: string | null;
	installmentNumber: number;
	principalPaid: number;
	interestPaid: number;
	totalPaid: number;
	dueDate: string;
	paidDate?: string | null;
	isAdvanced: boolean;
	advanceType?: "FRONT" | "BACK" | null;
}

export interface LoanPaymentPage {
	items: LoanPayment[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface EarlyPayoff {
	currency?: string;
	loanId: string;
	targetDate: string;
	advanceType: "FRONT" | "BACK";
	paidInstallments: number;
	totalToPay: number;
	savedInterest: number;
	remainingPrincipal: number;
}

export interface StoredDebtEvent {
	currency?: string;
	baseUpdatedAt?: string;
	id: string;
	debtPersonId: string;
	kind: "ORIGIN" | "MIGRATED_SETTLEMENT";
	amount: number;
	effect: number;
	date: string | null;
	dueDate?: string | null;
	description?: string | null;
	createdAt: string;
	updatedAt: string;
	deletedAt?: string | null;
	upgradeRecordId?: string;
}

export interface DebtEvent {
	currency?: string;
	id: string;
	amount: number;
	effect: number;
	date: string | null;
	dueDate?: string | null;
	description?: string | null;
	kind: "ORIGIN" | "TRANSACTION" | "PURCHASE" | "MIGRATED_SETTLEMENT";
	time: string | null;
	createdByUserId: string;
	createdByName: string;
	createdByMe: boolean;
}

export interface DebtPerson {
	balances?: { currency: string; amount: number }[];
	accountEmail: string | null;
	id: string;
	name: string;
	balance: number;
	isZaimuUser: boolean;
	connectionStatus: "PENDING" | "ACCEPTED" | "DECLINED" | null;
	events: DebtEvent[];
}

export interface DebtLedger {
	totalsByCurrency?: { currency: string; iOwe: number; net: number; owedToMe: number }[];
	people: DebtPerson[];
	totals: { iOwe: number; net: number; owedToMe: number };
}

export interface DebtInvitationPreview {
	items: DebtEvent[];
	hasMore: boolean;
	nextCursor: string | null;
	balance: number;
	eventCount: number;
}

export interface DebtInvitation {
	id: string;
	createdAt: string;
	counterpartyName: string;
	direction: "RECEIVED" | "SENT";
	status: "PENDING" | "ACCEPTED" | "DECLINED";
}

export interface CreditCardStatement {
	amountDue?: number;
	carriedInAmount?: number;
	carriedOutAmount?: number;
	chargesAmount?: number;
	creditInAmount?: number;
	periodPaymentAmount?: number;
	status?: "OPEN" | "PAID" | "CARRIED";
	balanceAmount: number;
	id: string;
	creditCardId: string;
	statementDate: string;
	dueDate: string;
	totalAmount: number;
	paidAmount: number;
	isPaid: boolean;
	isFullySynced?: boolean;
	isForecast?: boolean;
}

export interface CreditCardStatementPage {
	hasMore: boolean;
	items: CreditCardStatement[];
	nextCursor: string | null;
}

export interface CreditPurchaseEditDetails {
	currency?: string;
	originalAmount?: number | null;
	exchangeRate?: number | null;
	fees?: FinancialFee[];
	id: string;
	totalAmountCents: number;
	purchaseDate: string;
	externalId: string | null;
	feeAmount?: number | null;
	installmentImportedNumbers: readonly number[];
	debtSplit: DebtSplit | null;
}

export interface CreditPurchase {
	bookingCurrency?: string;
	currency?: string;
	originalAmount?: number | null;
	exchangeRate?: number | null;
	fees?: FinancialFee[];
	purchaseId?: string;
	creditCardId?: string;
	entryKind?: "INSTALLMENT" | "REFUND" | "CHARGE";
	refundableAmount?: number;
	refundedAmount?: number;
	refunds?: {
		id: string;
		amount: number;
		date: string;
		policy: "KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS";
		creditAmount: number;
		canceledAmount: number;
	}[];

	isStatementCharge?: boolean;
	id: string;
	statementId: string;
	description: string;
	debtSplit?: DebtSplit | null;
	storeName?: string | null;
	feeDescription?: string | null;
	feeAmount?: number | null;
	totalAmount: number;
	installments: number;
	currentInstallment: number;
	installmentAmount: number;
	isFullySynced?: boolean;
	isSynced?: boolean;
	purchaseDate: string;
	time?: string | null;
	tagIds?: string[];
	tags?: Tag[];
	parentId?: string;
	refundOfPurchaseId?: string | null;
	isRefund?: boolean;
	hasRefund?: boolean;
	refund?: { amount: number; date: string; id: string };
	recurrenceId?: string;
	recurrenceOccurrenceDate?: string;
	isForecast?: boolean;
	cashbackAccountId?: string | null;
	cashbackAmount?: number | null;
	cashbackYieldPeriod?: "MONTHLY" | "YEARLY" | null;
	cashbackYieldReferencePercentage?: number | null;
	cashbackYieldReferenceRate?: number | null;
	isSettled?: boolean;
	settledByPurchaseId?: string | null;
	refinancingFeeAmount?: number | null;
}

export interface CreditCardStatementDetail extends CreditCardStatement {
	payments: Transaction[];
	purchases: CreditPurchase[];
}

export interface DashboardPeriod {
	cardExpenses?: number;
	recurringCardExpenses?: number;
	fixedIncomeBalance: number;
	variableIncomeBalance: number;
	recurringIncome: number;
	recurringExpenses: number;
	accountBalance: number;
	endDate: string;
	endingBalance: number;
	expenses: number;
	income: number;
	initialBalance: number;
	net: number;
	savingsBalance: number;
	startDate: string;
}

export interface Dashboard {
	currency?: string;
	nativeAsOf?: string;
	consolidation?: {
		method: "EXPONENTIAL_90_DAY_HALF_LIFE";
		unavailable: boolean;
		forecastAvailable: boolean;
		publishedDates: Record<string, string>;
		histories: Array<{
			collectionId: string;
			startDate: string;
			endDate: string;
			state: string;
			coveredDays: number;
			requestedDays: number;
		}>;
	};

	referenceRatesAvailable: boolean;
	accounts: Array<{
		balance: number;
		currency?: string;
		id: string;
		institutionName: string | null;
		name: string | null;
		type: "CHECKING" | "CASH" | "SAVINGS" | "INVESTMENT" | "CASHBACK";
	}>;
	balanceBreakdown: {
		accountBalance: number;
		savingsBalance: number;
		fixedIncomeBalance: number;
		variableIncomeBalance: number;
	} | null;
	dailyBalances: Array<{ balance: number; date: string }>;
	creditCards: Array<{
		currency?: string;
		availableLimit: number;
		creditLimit: number;
		excludeFromTotals: boolean;
		financialAccountId: string;
		id: string;
		institutionName: string | null;
		name: string | null;
		statement: { balanceAmount: number; dueDate: string; id: string } | null;
	}>;
	debts: {
		iOwe: number;
		net: number;
		owedToMe: number;
		people: Array<{ balance: number; direction: "OWED" | "OWES"; id: string; name: string }>;
	} | null;
	forecasts: Array<{
		amount: number;
		date: string;
		direction: "INCOME" | "EXPENSE";
		id: string;
		name: string;
		sourceId: string;
		type: "CARD" | "LOAN" | "RECURRING" | "SALARY" | "SUBSCRIPTION" | "TRANSACTION";
	}>;
	period: DashboardPeriod | null;
	projectedCashFlowUntilMonthEnd: {
		recurringExpenses: number;
		recurringIncome: number;
		expenses: number;
		income: number;
		net: number;
	} | null;
	totalAvailableCredit: number | null;
}

export interface OpenFinanceBinding {
	id: string;
	connectionId: string;
	remoteAccountId: string;
	financialAccountId: string | null;
	creditCardId: string | null;
	paused: boolean;
}
export interface OpenFinanceConnection {
	id: string;
	itemId: string;
	bankName: string;
	status: string;
	bankUpdatedAt: string | null;
	remoteAccounts: { id: string; name: string; type: string; currencyCode: string }[];
	bindings: OpenFinanceBinding[];
}
export interface OpenFinanceConfiguration {
	available: boolean;
	configured: boolean;
	lastQueriedAt: string | null;
	connections: OpenFinanceConnection[];
}
export interface OpenFinanceSyncStatus {
	run: {
		id: string;
		status: string;
		processed: number;
		imported: number;
		linked: number;
		pending: number;
		startedAt: string;
		finishedAt: string | null;
		errors: { connectionId: string; message: string }[];
	} | null;
	reviews: { importId: string; kind: string; count: number }[];
}
export const openFinanceApi = {
	addConnection: (itemId: string) =>
		fetchWithAuth<OpenFinanceConfiguration>("/open-finance/connections", {
			body: JSON.stringify({ itemId }),
			method: "POST",
		}),
	configuration: () => fetchWithAuth<OpenFinanceConfiguration>("/open-finance/"),
	disconnect: (connectionId?: string) =>
		fetchWithAuth(connectionId ? `/open-finance/connections/${connectionId}` : "/open-finance/", {
			method: "DELETE",
		}),
	discoverConnections: () =>
		fetchWithAuth<
			OpenFinanceConfiguration & {
				discoveryAvailable: boolean;
				errors: { itemId: string; message: string }[];
			}
		>("/open-finance/connections/discover", { method: "POST" }),
	saveBinding: (
		connectionId: string,
		input: Pick<OpenFinanceBinding, "remoteAccountId" | "creditCardId" | "financialAccountId" | "paused">,
	) =>
		fetchWithAuth(`/open-finance/connections/${connectionId}/bindings`, {
			body: JSON.stringify(input),
			method: "PUT",
		}),
	saveCredentials: (clientId: string, clientSecret: string) =>
		fetchWithAuth("/open-finance/credentials", {
			body: JSON.stringify({ clientId, clientSecret }),
			method: "PUT",
		}),
	status: () => fetchWithAuth<OpenFinanceSyncStatus>("/open-finance/sync"),
	sync: (force = false) =>
		fetchWithAuth<{ runId: string | null }>("/open-finance/sync", {
			body: JSON.stringify({ force }),
			method: "POST",
		}),
};

export interface PaymentSuggestion {
	amount: number;
	cardName: string;
	creditCardId: string;
	dueDate: string;
	financialAccountId: string;
	statementId: string;
}
