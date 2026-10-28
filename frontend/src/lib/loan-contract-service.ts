import { financialReferenceResolver } from "@zaimu/finance/financial-indicators";
import { loanAccountAmounts } from "@zaimu/finance/loan";
import {
	activeLoanVersion,
	applyLoanSimulation,
	buildContractSchedule,
	createLoanContract,
	type LoanContractBook,
	loanContractSummary,
	type LoanContractTerms,
	type LoanReference,
	type LoanSimulation,
	type LoanSimulationInput,
	outstandingLoanSchedule,
	recordLoanPayment,
	restructureLoanContract,
	reverseLoanReceipt,
	simulateLoanOperation,
} from "@zaimu/finance/loan-contract";
import { legacyLoanBook, loanBookPaymentRows } from "@zaimu/finance/loan-legacy";
import { useAuthStore } from "@/stores/auth";
import {
	type IndicatorContext,
	type Loan,
	type LoanBooking,
	loanContractsApi,
	type Transaction,
} from "./api";
import { SessionChangedError } from "./api/client-api";
import { dataService } from "./dataService";
import { getLocalDateKey } from "./date";
import { readCurrencyRate } from "./financial-history";
import {
	commitLocalLoanContract,
	commitLocalLoanContracts,
	localAccounts,
	localLoanPayments,
	localLoans,
	localMeta,
} from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";
function owner() {
	const value = getCurrentCacheIdentity();
	if (!value) throw new Error("Sessão indisponível");
	return value;
}
export async function loanIndicatorContext(): Promise<IndicatorContext> {
	const identity = owner();
	try {
		const result = await loanContractsApi.indicators();
		if (owner() !== identity) throw new SessionChangedError();
		await localMeta.set("loan-indicators", result, identity);
		return result;
	} catch (error) {
		if (owner() !== identity) throw new SessionChangedError();
		const cached = (await localMeta.get("loan-indicators", identity)) as IndicatorContext | undefined;
		if (cached) return cached;
		throw error;
	}
}
export function loanReference(context: IndicatorContext): LoanReference {
	return financialReferenceResolver(context);
}
export function loanPresentation(book: LoanContractBook, previous?: Loan): Loan {
	const version = activeLoanVersion(book);
	const terms = version.terms;
	return {
		...previous,
		amortization: terms.amortization === "MANUAL" ? "PRICE" : terms.amortization,
		contractBook: book,
		currency: terms.currency,
		description: previous?.description,
		dueDay: Number(terms.firstDueDate.slice(8)),
		firstDueDate: terms.firstDueDate,
		id: book.loanId,
		institutionId: book.institutionId,
		interestRate: (terms.rate.fixedRate ?? 0) / 100,
		lender: previous?.lender ?? "Instituição",
		...loanContractSummary(book),
		principalAmount: terms.principalAmount,
		startDate: terms.startDate,
		totalInstallments: terms.totalInstallments,
		userId: previous?.userId ?? useAuthStore.getState().user?.id ?? useAuthStore.getState().guestId,
	};
}
async function storeBook(
	book: LoanContractBook,
	expectedRevision: number | null,
	identity: ReturnType<typeof owner>,
	description?: string,
	disbursement?: Transaction,
) {
	if (owner() !== identity) throw new SessionChangedError();
	const existing = await localLoans.getById(book.loanId, identity);
	const institution = (await dataService.financialInstitutions.getAll()).find(
		row => row.id === book.institutionId,
	);
	if (book.institutionId && !institution) throw new Error("Instituição indisponível");
	const row = loanPresentation(book, existing?.data);
	row.lender = institution?.name ?? row.lender;
	row.description = description ?? row.description;
	await commitLocalLoanContract(row, loanBookPaymentRows(book), expectedRevision, identity, disbursement);
	return book;
}
async function booking(book: LoanContractBook, amount: number, date: string, input: LoanBooking) {
	const account = input.accountId ? await localAccounts.getById(input.accountId, owner()) : null;
	if (
		input.accountId &&
		(!account || !["CASH", "CHECKING", "SAVINGS", "INVESTMENT"].includes(account.data.type))
	)
		throw new Error("Conta indisponível");
	const currency = activeLoanVersion(book).terms.currency;
	const accountCurrency = account ? (account.data.currency ?? "BRL") : null;
	const [accountAmount] = await loanAccountAmounts(
		[amount],
		currency,
		accountCurrency,
		input.accountAmount ?? undefined,
		async (from, to) => {
			const rate = await readCurrencyRate(date, from, to);
			if (!rate) throw new Error("Cotação indisponível");
			return rate.rate;
		},
	);
	return {
		accountAmount: accountAmount ?? null,
		accountCurrency,
		accountId: input.accountId,
		id: input.id,
	};
}
export const loanContractService = {
	async create(input: {
		institutionId: string;
		terms: LoanContractTerms;
		description?: string;
		disbursementTransactionId?: string;
		disbursementAccountId?: string;
	}) {
		if (!input.institutionId) throw new Error("Selecione instituição");
		if (!useAuthStore.getState().isGuestMode) return loanContractsApi.create(input);
		const identity = owner();
		const reference = input.terms.rate.indicator
			? loanReference(await loanIndicatorContext())
			: undefined;
		const book = createLoanContract(crypto.randomUUID(), input.institutionId, input.terms, reference);
		let transaction: Transaction | undefined;
		if (input.disbursementAccountId && input.disbursementTransactionId)
			throw new Error("Selecione criar ou vincular crédito");
		if (input.disbursementAccountId) {
			const account = await localAccounts.getById(input.disbursementAccountId, identity);
			if (
				!account ||
				!["CASH", "CHECKING", "SAVINGS", "INVESTMENT"].includes(account.data.type) ||
				(account.data.currency ?? "BRL") !== input.terms.currency
			)
				throw new Error("Conta de crédito incompatível");
			transaction = {
				amount: input.terms.principalAmount,
				bookingCurrency: input.terms.currency,
				createdAt: new Date().toISOString(),
				currency: input.terms.currency,
				date: input.terms.startDate,
				description: "Crédito de empréstimo",
				destinationFinancialAccountId: input.disbursementAccountId,
				id: crypto.randomUUID(),
				type: "INCOME",
			};
			book.disbursementTransactionId = transaction.id;
		}
		if (input.disbursementTransactionId) {
			const candidate = (await dataService.transactions.getAll()).find(
				row => row.id === input.disbursementTransactionId,
			);
			if (
				candidate?.type !== "INCOME" ||
				candidate.amount !== input.terms.principalAmount ||
				(candidate.currency ?? "BRL") !== input.terms.currency
			)
				throw new Error("Crédito recebido incompatível");
			if (
				(await localLoans.getAll(identity)).some(
					row => row.data.contractBook?.disbursementTransactionId === candidate.id,
				)
			)
				throw new Error("Crédito já associado");
			book.disbursementTransactionId = candidate.id;
		}
		return storeBook(book, null, identity, input.description, transaction);
	},
	async execute(id: string, simulation: LoanSimulation, input: LoanBooking) {
		if (simulation.input.quotedAmount === undefined)
			throw new Error("Informe valor confirmado pelo credor");
		if (!useAuthStore.getState().isGuestMode) return loanContractsApi.execute(id, simulation, input);
		const identity = owner();
		const book = await this.get(id);
		const reference = activeLoanVersion(book).terms.rate.indicator
			? loanReference(await loanIndicatorContext())
			: undefined;
		const next = applyLoanSimulation(
			book,
			simulation,
			await booking(book, simulation.amount, simulation.input.date, input),
			reference,
		);
		return storeBook(next, book.revision, identity);
	},
	async get(id: string): Promise<LoanContractBook> {
		if (!useAuthStore.getState().isGuestMode) return loanContractsApi.get(id);
		const identity = owner();
		const row = await localLoans.getById(id, identity);
		if (!row || row.data.needsPaymentReview) throw new Error("Revise histórico legado antes de operar");
		if (row.data.contractBook) return row.data.contractBook;
		const payments = (await localLoanPayments.getAll(identity))
			.filter(item => item.data.loanId === id)
			.map(item => item.data);
		return legacyLoanBook(row.data, payments);
	},
	async pay(
		id: string,
		input: {
			date: string;
			amount: number;
			expectedRevision: number;
			installmentIds?: string[];
			booking: LoanBooking;
		},
	) {
		if (!useAuthStore.getState().isGuestMode) return loanContractsApi.pay(id, input);
		const identity = owner();
		const book = await this.get(id);
		const next = recordLoanPayment(book, {
			...input,
			...(await booking(book, input.amount, input.date, input.booking)),
		});
		return storeBook(next, book.revision, identity);
	},
	async restructure(
		id: string,
		input: {
			institutionId: string;
			terms: LoanContractTerms;
			expectedRevision: number;
			kind: "RENEGOTIATE" | "PORTABILITY";
			settlementAmount: number;
		},
	) {
		if (!useAuthStore.getState().isGuestMode) return loanContractsApi.restructure(id, input);
		const identity = owner();
		const book = await this.get(id);
		const reference =
			input.terms.rate.indicator || activeLoanVersion(book).terms.rate.indicator
				? loanReference(await loanIndicatorContext())
				: undefined;
		const pair = restructureLoanContract(
			book,
			{ ...input, receiptId: crypto.randomUUID(), successorId: crypto.randomUUID() },
			reference,
		);
		const institutions = await dataService.financialInstitutions.getAll();
		const institution = institutions.find(row => row.id === input.institutionId);
		if (!institution) throw new Error("Instituição indisponível");
		const old = await localLoans.getById(id, identity);
		const source = loanPresentation(pair.source, old?.data);
		const successor = loanPresentation(pair.successor);
		successor.lender = institution.name;
		await commitLocalLoanContracts(
			[
				{ expectedRevision: book.revision, loan: source, payments: loanBookPaymentRows(pair.source) },
				{ expectedRevision: null, loan: successor, payments: loanBookPaymentRows(pair.successor) },
			],
			identity,
		);
		return pair;
	},
	async reverse(id: string, receiptId: string, revision: number) {
		const identity = owner();
		const input = {
			date: getLocalDateKey(),
			expectedRevision: revision,
			id: crypto.randomUUID(),
			receiptId,
		};
		if (!useAuthStore.getState().isGuestMode) return loanContractsApi.reverse(id, input);
		const book = await this.get(id);
		return storeBook(
			reverseLoanReceipt(book, receiptId, input.id, input.date, revision),
			revision,
			identity,
		);
	},

	async simulate(id: string, input: LoanSimulationInput) {
		if (!useAuthStore.getState().isGuestMode) return loanContractsApi.simulate(id, input);
		const book = await this.get(id);
		return simulateLoanOperation(
			book,
			input,
			activeLoanVersion(book).terms.rate.indicator
				? loanReference(await loanIndicatorContext())
				: undefined,
		);
	},
	async update(
		id: string,
		input: {
			institutionId: string;
			terms: LoanContractTerms;
			effectiveDate: string;
			expectedRevision: number;
		},
	) {
		if (!useAuthStore.getState().isGuestMode) return loanContractsApi.update(id, input);
		const identity = owner();
		const book = await this.get(id);
		if (book.revision !== input.expectedRevision) throw new Error("Contrato mudou");
		const prior = activeLoanVersion(book).terms;
		if (
			book.receipts.length &&
			(input.terms.currency !== prior.currency ||
				Math.abs(
					input.terms.principalAmount -
						outstandingLoanSchedule(book).reduce((sum, row) => sum + row.principal, 0),
				) > 0.005)
		)
			throw new Error("Preserve moeda e principal restante do histórico");
		const reference = input.terms.rate.indicator
			? loanReference(await loanIndicatorContext())
			: undefined;
		book.revision++;
		book.institutionId = input.institutionId;
		book.versions.push({
			effectiveDate: input.effectiveDate,
			reason: "EDIT",
			revision: book.revision,
			schedule: buildContractSchedule(input.terms, book.revision, reference),
			terms: input.terms,
		});
		return storeBook(book, input.expectedRevision, identity);
	},
};
