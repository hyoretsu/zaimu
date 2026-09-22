import { getLocalDateKey } from "./date";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

interface FetchOptions {
	method?: "GET" | "POST" | "PATCH" | "DELETE";
	body?: unknown;
	params?: Record<string, string | number | boolean | undefined>;
}

async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
	const { method = "GET", body, params } = options;

	let url = `${API_URL}${endpoint}`;

	if (params) {
		const searchParams = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) {
				searchParams.append(key, String(value));
			}
		}
		const queryString = searchParams.toString();
		if (queryString) {
			url += `?${queryString}`;
		}
	}

	const response = await fetch(url, {
		body: body ? JSON.stringify(body) : undefined,
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
		},
		method,
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: "Erro desconhecido" }));
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	return response.json();
}

// Types
export interface User {
	id: string;
	email: string;
	name?: string;
	createdAt: string;
}

export interface FinancialAccount {
	id: string;
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
	amount: number | null;
	date: string;
	financialAccountId: string;
	id: string;
	isExcluded: boolean;
	kind: "AUTOMATIC" | "MANUAL";
	origin?: "SYSTEM" | "USER";
}

export interface RewardsAccount {
	id: string;
	financialAccountId: string;
	kind: "POINTS" | "CASHBACK";
	initialBalance: number;
	conversionPoints?: number | null;
	conversionAmount?: number | null;
}

export interface FinancialInstitution {
	id: string;
	name: string;
	yieldPolicies?: FinancialInstitutionYieldPolicy[];
}
export interface FinancialInstitutionYieldPolicy {
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
	id: string;
	financialAccountId: string;
	creditLimit: number;
	securityDeposit?: number | null;
	excludeFromTotals: boolean;
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

export interface Transaction {
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
	type: "INCOME" | "EXPENSE" | "TRANSFER";
	categoryId?: string;
	categoryName?: string;
	categoryColor?: string;
	recurrenceId?: string;
	recurrenceOccurrenceDate?: string;
	salaryId?: string;
	salaryOccurrenceDate?: string;
	subscriptionId?: string;
	subscriptionOccurrenceDate?: string;
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
	creditCardStatementId?: string;
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
	creditCardStatementId?: string | null;
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
	categoryColor?: string | null;
	categoryId?: string | null;
	categoryName?: string | null;
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
	id: string;
	amount: number;
	balanceAfter?: number | null;
	categoryId?: string | null;
	creditCardStatementId?: string | null;
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
	id: string;
	categoryId?: string | null;
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
	id: string;
	creditCardId: string;
	createdAt: string;
	dueDate: string;
	fileName: string;
	hasMore: boolean;
	items: CreditCardImportItem[];
	nextCursor: string | null;
	pendingItemCount: number;
	provider: "MERCADO_PAGO" | "BRADESCO" | "INTER" | "NUBANK" | "PICPAY";
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
	parentId?: string;
}

export interface Loan {
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
	amortization: "PRICE" | "SAC" | "SACRE";
	paidInstallments?: number;
	remainingInstallments?: number;
	totalPaid?: number;
}

export interface LoanPayment {
	id: string;
	loanId: string;
	installmentNumber: number;
	principalPaid: number;
	interestPaid: number;
	totalPaid: number;
	dueDate: string;
	paidDate?: string;
	isAdvanced: boolean;
	advanceType?: "FRONT" | "BACK";
}

export interface EarlyPayoff {
	loanId: string;
	targetDate: string;
	advanceType: "FRONT" | "BACK";
	paidInstallments: number;
	totalToPay: number;
	savedInterest: number;
	remainingPrincipal: number;
}

export interface Debt {
	id: string;
	userId: string;
	personName: string;
	amount: number;
	description?: string;
	isOwedToMe: boolean;
	date?: string;
	dueDate?: string;
	isPaid: boolean;
	paidDate?: string;
	personId?: string;
}

export interface DebtEvent {
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
	id: string;
	name: string;
	balance: number;
	isZaimuUser: boolean;
	connectionStatus: "PENDING" | "ACCEPTED" | "DECLINED" | null;
	events: DebtEvent[];
}

export interface DebtLedger {
	people: DebtPerson[];
	totals: { iOwe: number; net: number; owedToMe: number };
}

export interface DebtInvitation {
	balance: number;
	id: string;
	createdAt: string;
	counterpartyName: string;
	direction: "RECEIVED" | "SENT";
	events: DebtEvent[];
	status: "PENDING" | "ACCEPTED" | "DECLINED";
}

export interface Salary {
	id: string;
	userId: string;
	financialAccountId?: string | null;
	source: string;
	amount: number;
	frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY";
	payDay: number;
	dayOfWeek?: number | null;
	startDate: string;
	autoGenerateFrom: string;
	endDate?: string | null;
	isActive: boolean;
	categoryId?: string;
	tagIds?: string[];
	tags?: Tag[];
}

export interface Subscription {
	id: string;
	userId: string;
	name: string;
	amount: number;
	debtSplit?: DebtSplit | null;
	billingDay: number;
	dayOfWeek?: number | null;
	frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY";
	paymentMethod: "DEBIT" | "CREDIT" | "PIX" | "CASH" | "TRANSFER" | "BOLETO";
	financialAccountId?: string | null;
	storeName?: string | null;
	startDate: string;
	endDate?: string | null;
	isActive: boolean;
	categoryId?: string;
	tagIds?: string[];
	tags?: Tag[];
}

export interface RecurringPayment {
	id: string;
	userId: string;
	name: string;
	amount: number;
	debtSplit?: DebtSplit | null;
	frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY";
	dayOfMonth?: number;
	dayOfWeek?: number | null;
	startDate: string;
	endDate?: string | null;
	categoryId?: string;
	paymentMethod: "DEBIT" | "CREDIT" | "PIX" | "CASH" | "TRANSFER" | "BOLETO";
	financialAccountId?: string | null;
	storeName?: string | null;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
	category?: string;
	tagIds?: string[];
	tags?: Tag[];
	day?: number;
	type?: "INCOME" | "EXPENSE";
}

export interface CreditCardStatement {
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

export interface CreditPurchase {
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
	categoryId?: string;
	categoryName?: string;
	categoryColor?: string;
	tagIds?: string[];
	tags?: Tag[];
	parentId?: string;
	refundOfPurchaseId?: string | null;
	isRefund?: boolean;
	hasRefund?: boolean;
	refund?: { amount: number; date: string; id: string };
	subscriptionId?: string;
	subscriptionOccurrenceDate?: string;
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

export interface LegacyDashboard {
	summary: {
		totalBalance: number;
		currentMonth: {
			income: number;
			expenses: number;
			net: number;
		};
		lastMonth: {
			income: number;
			expenses: number;
		};
	};
	accounts: Array<{
		id: string;
		name: string | null;
		type: string;
		balance: number | null;
	}>;
	upcomingBills: Array<{
		id: string;
		name: string;
		amount: number;
		dueDay: number;
	}>;
	pendingStatements: CreditCardStatement[];
	loans: {
		active: Array<{
			id: string;
			lender: string;
			remainingInstallments: number;
			remainingAmount: number;
			installmentAmount: number;
		}>;
		totalRemaining: number;
		monthlyPayment: number;
	};
	debts: {
		owedToMe: number;
		iOwe: number;
		net: number;
	};
	recentTransactions: Transaction[];
}

export interface DashboardPeriod {
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
	accounts: Array<{
		balance: number;
		id: string;
		institutionName: string | null;
		name: string | null;
		type: "CHECKING" | "SAVINGS";
	}>;
	balanceBreakdown: { accountBalance: number; savingsBalance: number };
	comparison: DashboardPeriod[];
	dailyBalances: Array<{ balance: number; date: string }>;
	creditCards: Array<{
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
	};
	forecasts: Array<{
		amount: number;
		date: string;
		direction: "INCOME" | "EXPENSE";
		id: string;
		name: string;
		sourceId: string;
		type: "CARD" | "LOAN" | "RECURRING" | "SALARY" | "SUBSCRIPTION" | "TRANSACTION";
	}>;
	period: DashboardPeriod;
	projectedCashFlowUntilMonthEnd: { expenses: number; income: number; net: number };
	totalAvailableCredit: number;
}

// API functions
export const api = {
	addCreditPurchase: (
		cardId: string,
		data: {
			description?: string;
			storeName?: string;
			totalAmount: number;
			installments?: number;
			purchaseDate: string;
			time?: string | null;
			categoryId?: string;
			tagIds?: string[];
		},
	) => fetchApi(`/credit-cards/${cardId}/purchases`, { body: data, method: "POST" }),

	advanceLoan: (
		loanId: string,
		data: {
			installmentsToAdvance: number;
			advanceType: "FRONT" | "BACK";
			paidDate?: string;
			financialAccountId?: string;
		},
	) => fetchApi(`/loans/${loanId}/advance`, { body: data, method: "POST" }),

	createCategory: (data: { name: string; color?: string; icon?: string; parentId?: string }) =>
		fetchApi<Category>("/categories", { body: data, method: "POST" }),

	createDebt: (data: {
		personName: string;
		amount: number;
		description?: string;
		isOwedToMe?: boolean;
		date?: null | string;
		dueDate?: string;
	}) => fetchApi<Debt>("/debts", { body: data, method: "POST" }),

	createFinancialAccount: (data: {
		institutionName?: string;
		name?: string | null;
		type?: FinancialAccount["type"];
		creditCard?: {
			creditLimit: number;
			securityDeposit?: number;
			statementDay: number;
			dueDay: number;
			workingDueDate?: boolean;
		};
	}) => fetchApi<FinancialAccount>("/financial-accounts", { body: data, method: "POST" }),

	createLoan: (data: {
		lender: string;
		principalAmount: number;
		interestRate: number;
		totalInstallments: number;
		installmentAmount?: number;
		dueDay: number;
		startDate: string;
		firstDueDate: string;
		description?: string;
		amortization?: Loan["amortization"];
	}) => fetchApi<Loan>("/loans", { body: data, method: "POST" }),

	createRecurringPayment: (data: {
		name: string;
		amount: number;
		frequency: RecurringPayment["frequency"];
		day?: number;
		category?: string;
		type?: RecurringPayment["type"];
	}) =>
		fetchApi<RecurringPayment>("/recurring", {
			body: {
				amount: data.amount,
				dayOfMonth: data.day,
				frequency: data.frequency,
				name: data.name,
				startDate: getLocalDateKey(),
			},
			method: "POST",
		}),

	createSalary: (data: {
		source: string;
		amount: number;
		financialAccountId: string;
		frequency?: Salary["frequency"];
		payDay: number;
		startDate: string;
		endDate?: string;
	}) => fetchApi<Salary>("/salaries", { body: data, method: "POST" }),

	createSubscription: (data: {
		name: string;
		amount: number;
		billingDay: number;
		frequency?: Subscription["frequency"];
		paymentMethod?: Subscription["paymentMethod"];
		startDate: string;
		endDate?: string;
	}) => fetchApi<Subscription>("/subscriptions", { body: data, method: "POST" }),

	createTransaction: (data: {
		amount: number;
		date: string;
		time?: string | null;
		description?: string;
		type?: Transaction["type"];
		categoryId?: string;
		tagIds?: string[];
		originFinancialAccountId?: string;
		destinationFinancialAccountId?: string;
	}) => fetchApi<Transaction>("/transactions", { body: data, method: "POST" }),

	deleteFinancialAccount: (id: string) =>
		fetchApi<{ success: boolean }>(`/financial-accounts/${id}`, { method: "DELETE" }),

	deleteRecurringPayment: (id: string) =>
		fetchApi<{ success: boolean }>(`/recurring/${id}`, { method: "DELETE" }),

	deleteTransaction: (id: string) =>
		fetchApi<{ success: boolean }>(`/transactions/${id}`, { method: "DELETE" }),

	// Categories
	getCategories: () => fetchApi<Category[]>("/categories"),

	getCreditCardStatement: (cardId: string, statementId: string) =>
		fetchApi<CreditCardStatementDetail>(`/credit-cards/${cardId}/statements/${statementId}`),

	getCreditCardStatements: (cardId: string, isPaid?: boolean) =>
		fetchApi<CreditCardStatement[]>(`/credit-cards/${cardId}/statements`, {
			params: { isPaid },
		}),

	// Credit Cards
	getCreditCards: () => fetchApi<CreditCard[]>("/credit-cards"),

	// Dashboard
	getDashboard: () => fetchApi<Dashboard>("/dashboard"),

	// Debts
	getDebts: (params?: { isOwedToMe?: boolean; isPaid?: boolean; personName?: string }) =>
		fetchApi<{
			debts: Debt[];
			totals: { owedToMe: number; iOwe: number; net: number };
		}>("/debts", { params }),

	getDebtsSummary: () =>
		fetchApi<
			Array<{
				person: string;
				owedToMe: number;
				iOwe: number;
				netBalance: number;
				debtCount: number;
			}>
		>("/debts/summary"),

	getEarlyPayoff: (loanId: string, params?: { targetDate?: string; advanceType?: "FRONT" | "BACK" }) =>
		fetchApi<EarlyPayoff>(`/loans/${loanId}/early-payoff`, { params }),

	getFinancialAccount: (id: string) => fetchApi<FinancialAccount>(`/financial-accounts/${id}`),

	// Accounts
	getFinancialAccounts: () => fetchApi<FinancialAccount[]>("/financial-accounts"),

	getLoan: (id: string) => fetchApi<Loan & { payments: LoanPayment[]; schedule: unknown[] }>(`/loans/${id}`),

	// Loans
	getLoans: () => fetchApi<Loan[]>("/loans"),

	getRecurringPayments: async (params?: { isActive?: boolean }) => {
		const payments = await fetchApi<RecurringPayment[]>("/recurring", { params });

		return payments.map(payment => ({
			...payment,
			day: payment.dayOfMonth ?? payment.dayOfWeek ?? 1,
			type: payment.type ?? "EXPENSE",
		}));
	},

	// Salaries
	getSalaries: (params?: { isActive?: boolean }) => fetchApi<Salary[]>("/salaries", { params }),

	// Subscriptions
	getSubscriptions: (params?: { isActive?: boolean }) =>
		fetchApi<{ subscriptions: Subscription[]; totalMonthlyCost: number }>("/subscriptions", { params }),

	getTransaction: (id: string) => fetchApi<Transaction>(`/transactions/${id}`),

	// Transactions
	getTransactions: (params?: {
		startDate?: string;
		endDate?: string;
		type?: Transaction["type"];
		categoryId?: string;
		financialAccountId?: string;
		limit?: number;
		offset?: number;
	}) => fetchApi<Transaction[]>("/transactions", { params }),

	payLoanInstallment: (
		loanId: string,
		installmentNumber: number,
		data: {
			paidDate?: string;
			financialAccountId?: string;
			isAdvanced?: boolean;
			advanceType?: "FRONT" | "BACK";
		},
	) =>
		fetchApi(`/loans/${loanId}/payments/${installmentNumber}/pay`, {
			body: data,
			method: "POST",
		}),

	payStatement: (
		cardId: string,
		statementId: string,
		data: { amount?: number; date: string; financialAccountId: string; time?: string | null },
	) =>
		fetchApi(`/credit-cards/${cardId}/statements/${statementId}/pay`, {
			body: data,
			method: "POST",
		}),

	updateDebt: (id: string, data: Partial<Debt>) =>
		fetchApi<Debt>(`/debts/${id}`, { body: data, method: "PATCH" }),
	updateFinancialAccount: (id: string, data: Partial<FinancialAccount> & { institutionName?: string }) =>
		fetchApi<FinancialAccount>(`/financial-accounts/${id}`, { body: data, method: "PATCH" }),

	updateSubscription: (id: string, data: Partial<Subscription>) =>
		fetchApi<Subscription>(`/subscriptions/${id}`, { body: data, method: "PATCH" }),

	updateTransaction: (id: string, data: Partial<Transaction>) =>
		fetchApi<Transaction>(`/transactions/${id}`, { body: data, method: "PATCH" }),
};

export default api;
