import {
	civilDate,
	civilDays,
	composedRateFactor,
	type FinancialRateRule,
	shiftMonths,
} from "./financial-indicators";
import { fromMinorUnits, normalizeCurrency, roundMoney, toMinorUnits } from "./money";

export type LoanMethod = "PRICE" | "SAC" | "MANUAL";
export interface LoanCharge {
	name: string;
	amount: number;
	financed: boolean;
	recurring: boolean;
}
export interface LoanContractTerms {
	principalAmount: number;
	currency: string;
	startDate: string;
	firstDueDate: string;
	totalInstallments: number;
	amortization: LoanMethod;
	rate: FinancialRateRule;
	graceMonths: number;
	graceInterest: "PAY" | "CAPITALIZE";
	charges: LoanCharge[];
	lateFinePercent: number;
	lateMonthlyPercent: number;
	discount: "PRESENT_VALUE" | "NO_DISCOUNT";
	manualSchedule?: { dueDate: string; principal: number; interest: number; charges: number }[];
}
export interface ContractInstallment {
	id: string;
	number: number;
	dueDate: string;
	principal: number;
	interest: number;
	charges: number;
	balance: number;
}
export interface LoanAllocation {
	installmentId: string;
	principal: number;
	interest: number;
	charges: number;
	discount: number;
}
export interface LoanReceipt {
	id: string;
	date: string;
	amount: number;
	accountId: string | null;
	accountCurrency: string | null;
	accountAmount: number | null;
	allocations: LoanAllocation[];
	kind: "PAYMENT" | "ADVANCE" | "PAYOFF" | "REVERSAL" | "REFINANCE";
	reversesId?: string;
	lateCharges: number;
}
export interface LoanContractVersion {
	revision: number;
	effectiveDate: string;
	reason: "CREATE" | "EDIT" | "ADVANCE" | "RENEGOTIATE" | "PORTABILITY" | "REVERSAL";
	receiptId?: string;
	terms: LoanContractTerms;
	schedule: ContractInstallment[];
}
export interface LoanContractBook {
	loanId: string;
	institutionId: string | null;
	revision: number;
	versions: LoanContractVersion[];
	receipts: LoanReceipt[];
	/** Financial transactions are explicit; legacy registration never creates a disbursement. */
	disbursementTransactionId?: string | null;
	predecessorLoanId?: string | null;
	successorLoanId?: string | null;
}
export type LoanReference = (rule: FinancialRateRule, from: string, through: string) => number | null;
export interface LoanSimulationInput {
	date: string;
	mode: "FRONT" | "BACK" | "SELECTED" | "REDUCE_TERM" | "REDUCE_PAYMENT" | "PAYOFF";
	count?: number;
	installmentIds?: string[];
	amount?: number;
	/** Contract currency. Explicit creditor quote can replace the estimated amount. */
	quotedAmount?: number;
}
export interface LoanSimulation {
	revision: number;
	input: LoanSimulationInput;
	currency: string;
	amount: number;
	discount: number;
	interestSaved: number;
	charges: number;
	allocations: LoanAllocation[];
	schedule: ContractInstallment[];
	beforeTotal: number;
	afterTotal: number;
	beforeMaturity: string;
	afterMaturity: string;
}
const positive = (value: number, zero = true) => {
	if (!Number.isFinite(value) || (zero ? value < 0 : value <= 0))
		throw new Error("Valor financeiro inválido");
};
export function validateLoanTerms(terms: LoanContractTerms): void {
	positive(terms.principalAmount, false);
	normalizeCurrency(terms.currency);
	civilDate(terms.startDate);
	civilDate(terms.firstDueDate);
	if (terms.firstDueDate < terms.startDate) throw new Error("Primeiro vencimento anterior ao contrato");
	if (
		!Number.isSafeInteger(terms.totalInstallments) ||
		terms.totalInstallments < 1 ||
		terms.totalInstallments > 1200
	)
		throw new Error("Número de parcelas inválido");
	if (
		!Number.isSafeInteger(terms.graceMonths) ||
		terms.graceMonths < 0 ||
		terms.graceMonths >= terms.totalInstallments
	)
		throw new Error("Carência inválida");
	if (!["PRICE", "SAC", "MANUAL"].includes(terms.amortization)) throw new Error("Amortização inválida");
	positive(terms.lateFinePercent);
	positive(terms.lateMonthlyPercent);
	if (terms.rate.indicator && (!Number.isFinite(terms.rate.percentage) || terms.rate.percentage! < 0))
		throw new Error("Percentual do indicador inválido");
	positive(terms.rate.fixedRate ?? 0);
	if (
		terms.rate.lagMonths != null &&
		(!Number.isInteger(terms.rate.lagMonths) || terms.rate.lagMonths < 0 || terms.rate.lagMonths > 24)
	)
		throw new Error("Defasagem inválida");
	for (const charge of terms.charges) {
		positive(charge.amount);
		if (!charge.name.trim() || (charge.financed && charge.recurring)) throw new Error("Encargo inválido");
	}
	if (terms.amortization === "MANUAL") {
		const rows = terms.manualSchedule;
		if (!rows?.length || rows.length !== terms.totalInstallments || terms.graceMonths)
			throw new Error("Cronograma manual inválido");
		let previous = terms.startDate;
		for (const row of rows) {
			civilDate(row.dueDate);
			if (row.dueDate < previous) throw new Error("Cronograma fora de ordem");
			previous = row.dueDate;
			positive(row.principal);
			positive(row.interest);
			positive(row.charges);
		}
		const financed = terms.charges
			.filter(row => row.financed)
			.reduce((sum, row) => sum + row.amount, terms.principalAmount);
		if (
			toMinorUnits(
				rows.reduce((sum, row) => sum + row.principal, 0),
				terms.currency,
			) !== toMinorUnits(financed, terms.currency)
		)
			throw new Error("Principal do cronograma diverge do valor financiado");
	}
}
export function monthlyLoanRate(
	terms: LoanContractTerms,
	from: string,
	through: string,
	reference?: LoanReference,
): number {
	const quoted = terms.rate.indicator ? (reference?.(terms.rate, from, through) ?? null) : null;
	return composedRateFactor(terms.rate, quoted, 1, terms.rate.fixedPeriod === "YEARLY" ? 1 / 12 : 1) - 1;
}
export function buildContractSchedule(
	terms: LoanContractTerms,
	revision = 1,
	reference?: LoanReference,
): ContractInstallment[] {
	validateLoanTerms(terms);
	const currency = terms.currency;
	const units = (amount: number) => toMinorUnits(roundMoney(amount, currency), currency);
	let balance = units(
		terms.charges
			.filter(row => row.financed)
			.reduce((sum, row) => sum + row.amount, terms.principalAmount),
	);
	if (terms.amortization === "MANUAL")
		return terms.manualSchedule!.map((row, index) => {
			balance -= units(row.principal);
			return {
				...row,
				balance: fromMinorUnits(balance, currency),
				id: `${revision}:${index + 1}`,
				number: index + 1,
			};
		});
	let initialAmortizing = balance;
	const remainingCount = terms.totalInstallments - terms.graceMonths;
	const recurringCharges = units(
		terms.charges.filter(row => row.recurring).reduce((sum, row) => sum + row.amount, 0),
	);
	const upfrontCharges = units(
		terms.charges
			.filter(row => !row.financed && !row.recurring)
			.reduce((sum, row) => sum + row.amount, 0),
	);
	return Array.from({ length: terms.totalInstallments }, (_, index) => {
		const dueDate = shiftMonths(terms.firstDueDate, index);
		const previousDate = index ? shiftMonths(terms.firstDueDate, index - 1) : terms.startDate;
		const rate = monthlyLoanRate(terms, previousDate, dueDate, reference);
		let interest = Math.round(balance * rate);
		let principal = 0;
		if (index < terms.graceMonths) {
			if (terms.graceInterest === "CAPITALIZE") {
				balance += interest;
				interest = 0;
			}
			initialAmortizing = balance;
		} else {
			const left = terms.totalInstallments - index;
			const fixed =
				rate === 0
					? Math.round(balance / left)
					: Math.round((balance * rate) / (1 - (1 + rate) ** -left));
			principal =
				index === terms.totalInstallments - 1
					? balance
					: terms.amortization === "PRICE"
						? Math.min(balance, Math.max(0, fixed - interest))
						: Math.min(
								balance,
								Math.floor(initialAmortizing / remainingCount) +
									(index - terms.graceMonths < initialAmortizing % remainingCount ? 1 : 0),
							);
			balance -= principal;
		}
		return {
			balance: fromMinorUnits(balance, currency),
			charges: fromMinorUnits(recurringCharges + (index === 0 ? upfrontCharges : 0), currency),
			dueDate,
			id: `${revision}:${index + 1}`,
			interest: fromMinorUnits(interest, currency),
			number: index + 1,
			principal: fromMinorUnits(principal, currency),
		};
	});
}
export function createLoanContract(
	loanId: string,
	institutionId: string | null,
	terms: LoanContractTerms,
	reference?: LoanReference,
): LoanContractBook {
	return {
		institutionId,
		loanId,
		receipts: [],
		revision: 1,
		versions: [
			{
				effectiveDate: terms.startDate,
				reason: "CREATE",
				revision: 1,
				schedule: buildContractSchedule(terms, 1, reference),
				terms: structuredClone(terms),
			},
		],
	};
}
export function activeLoanVersion(book: LoanContractBook): LoanContractVersion {
	const version = book.versions.at(-1);
	if (!version || version.revision !== book.revision) throw new Error("Versão contratual inválida");
	return version;
}
export function outstandingLoanSchedule(book: LoanContractBook): ContractInstallment[] {
	const version = activeLoanVersion(book);
	const reversed = new Set(book.receipts.filter(row => row.kind === "REVERSAL").map(row => row.reversesId));
	const paid = book.receipts
		.filter(row => row.kind !== "REVERSAL" && !reversed.has(row.id))
		.flatMap(row => row.allocations);
	return version.schedule
		.map(row => {
			const allocations = paid.filter(allocation => allocation.installmentId === row.id);
			return {
				...row,
				charges: roundMoney(
					Math.max(
						0,
						row.charges - allocations.reduce((sum, allocation) => sum + allocation.charges, 0),
					),
					version.terms.currency,
				),
				interest: roundMoney(
					row.interest - allocations.reduce((sum, allocation) => sum + allocation.interest, 0),
					version.terms.currency,
				),
				principal: roundMoney(
					Math.max(
						0,
						row.principal -
							allocations.reduce((sum, allocation) => sum + allocation.principal, 0),
					),
					version.terms.currency,
				),
			};
		})
		.filter(row => Math.abs(row.principal + row.interest + row.charges) > 0.0000001);
}
export function loanScheduleTotal(rows: ContractInstallment[], currency: string): number {
	return roundMoney(
		rows.reduce((sum, row) => sum + row.principal + row.interest + row.charges, 0),
		currency,
	);
}
export function simulateLoanOperation(
	book: LoanContractBook,
	input: LoanSimulationInput,
	reference?: LoanReference,
): LoanSimulation {
	civilDate(input.date);
	const { terms } = activeLoanVersion(book);
	if (input.date < activeLoanVersion(book).effectiveDate || book.successorLoanId)
		throw new Error("Contrato indisponível nesta data");
	const currency = terms.currency;
	const round = (amount: number) => roundMoney(amount, currency);
	const rows = outstandingLoanSchedule(book);
	if (!rows.length) throw new Error("Empréstimo quitado");
	const beforeTotal = loanScheduleTotal(rows, currency);
	let selected: ContractInstallment[] = [];
	let schedule = structuredClone(rows);
	let allocations: LoanAllocation[] = [];
	let amount = 0;
	let discount = 0;
	if (input.mode === "REDUCE_PAYMENT" || input.mode === "REDUCE_TERM") {
		positive(input.amount!, false);
		if (terms.amortization === "MANUAL") throw new Error("Cronograma manual exige seleção de parcelas");
		if (rows.some(row => row.dueDate < input.date))
			throw new Error("Regularize parcelas vencidas antes de amortizar");
		const principal = round(rows.reduce((sum, row) => sum + row.principal, 0));
		if (input.amount! > principal) throw new Error("Amortização excede principal restante");
		if (round(input.amount!) === principal) {
			const payoff = simulateLoanOperation(book, { ...input, mode: "PAYOFF" }, reference);
			return { ...payoff, input: structuredClone(input) };
		}
		const principalReduction = round(input.amount!);
		const nextDue = rows[0]!;
		const periodStart =
			shiftMonths(nextDue.dueDate, -1) > terms.startDate
				? shiftMonths(nextDue.dueDate, -1)
				: terms.startDate;
		const elapsed = Math.max(
			0,
			Math.min(
				1,
				civilDays(periodStart, input.date) / Math.max(1, civilDays(periodStart, nextDue.dueDate)),
			),
		);
		const accrued = round(nextDue.interest * (principalReduction / principal) * elapsed);
		amount = round(principalReduction + accrued);
		const left = round(principal - principalReduction);
		const revision = book.revision + 1;
		let count = rows.length;
		if (input.mode === "REDUCE_TERM" && left > 0) {
			const rate = monthlyLoanRate(terms, input.date, rows[0]!.dueDate, reference);
			const payment = rows[0]!.principal + rows[0]!.interest;
			count =
				terms.amortization === "SAC"
					? Math.ceil(left / Math.max(0.000001, rows[0]!.principal))
					: rate <= 0
						? Math.ceil(left / Math.max(0.000001, payment))
						: Math.ceil(-Math.log(1 - (left * rate) / payment) / Math.log1p(rate));
			count = Math.max(1, Math.min(rows.length, count));
		}
		schedule =
			left === 0
				? []
				: buildContractSchedule(
						{
							...terms,
							charges: terms.charges.filter(row => row.recurring),
							firstDueDate: rows[0]!.dueDate,
							graceMonths: 0,
							principalAmount: left,
							startDate: input.date,
							totalInstallments: count,
						},
						revision,
						reference,
					);
		if (schedule[0]) {
			const recurring = terms.charges
				.filter(charge => charge.recurring)
				.reduce((sum, charge) => sum + charge.amount, 0);
			schedule[0].charges = round(schedule[0].charges + Math.max(0, rows[0]!.charges - recurring));
		}
		// Settle the old schedule; its replacement is recorded as a new immutable version.
		allocations = rows.map(row => ({
			charges: row.charges,
			discount: 0,
			installmentId: row.id,
			interest: row.interest,
			principal: row.principal,
		}));
		discount = round(beforeTotal - amount - loanScheduleTotal(schedule, currency));
	} else {
		if (input.mode === "PAYOFF") selected = rows;
		else if (input.mode === "SELECTED") {
			const ids = new Set(input.installmentIds);
			selected = rows.filter(row => ids.has(row.id));
			if (!ids.size || selected.length !== ids.size) throw new Error("Seleção de parcelas inválida");
		} else {
			if (!Number.isInteger(input.count) || input.count! < 1 || input.count! > rows.length)
				throw new Error("Quantidade inválida");
			selected = (input.mode === "BACK" ? rows.toReversed() : rows).slice(0, input.count);
		}
		for (const row of selected) {
			const rate =
				row.dueDate <= input.date ? 0 : monthlyLoanRate(terms, input.date, row.dueDate, reference);
			const months = Math.max(0, civilDays(input.date, row.dueDate) / (365 / 12));
			const nominal = row.principal + row.interest + row.charges;
			// Charges are contractual: discounts apply to principal/interest only unless creditor quote overrides.
			const present =
				terms.discount === "NO_DISCOUNT"
					? nominal
					: (row.principal + row.interest) / (1 + rate) ** months + row.charges;
			const saved = Math.max(0, round(nominal - present));
			allocations.push({
				charges: row.charges,
				discount: saved,
				installmentId: row.id,
				interest: row.interest,
				principal: row.principal,
			});
			amount += nominal - saved + loanInstallmentLateCharges(book, row, input.date);
			discount += saved;
		}
		const selectedIds = new Set(selected.map(row => row.id));
		schedule = schedule.filter(row => !selectedIds.has(row.id));
	}
	amount = round(amount);
	discount = round(discount);
	if (input.quotedAmount !== undefined) {
		positive(input.quotedAmount, false);
		const delta = round(amount - input.quotedAmount);
		amount = round(input.quotedAmount);
		discount = round(discount + delta);
		if (allocations[0]) allocations[0].discount = round(allocations[0].discount + delta);
	}
	const afterTotal = loanScheduleTotal(schedule, currency);
	return {
		afterMaturity: schedule.at(-1)?.dueDate ?? input.date,
		afterTotal,
		allocations,
		amount,
		beforeMaturity: rows.at(-1)!.dueDate,
		beforeTotal,
		charges: round(
			selected.reduce(
				(sum, row) => sum + row.charges + loanInstallmentLateCharges(book, row, input.date),
				0,
			),
		),
		currency,
		discount,
		input: structuredClone(input),
		interestSaved: round(beforeTotal - amount - afterTotal),
		revision: book.revision,
		schedule,
	};
}
export function applyLoanSimulation(
	book: LoanContractBook,
	simulation: LoanSimulation,
	payment: Pick<LoanReceipt, "id" | "accountId" | "accountCurrency" | "accountAmount">,
	reference?: LoanReference,
): LoanContractBook {
	if (book.revision !== simulation.revision || book.receipts.some(row => row.id === payment.id))
		throw new Error("Simulação desatualizada");
	const fresh = simulateLoanOperation(book, simulation.input, reference);
	if (canonicalLoanValue(fresh) !== canonicalLoanValue(simulation))
		throw new Error("Simulação mudou; revise novamente");
	const next = structuredClone(book);
	const version = activeLoanVersion(book);
	const revision = book.revision + 1;
	next.revision = revision;
	next.receipts.push({
		...payment,
		allocations: simulation.allocations,
		amount: simulation.amount,
		date: simulation.input.date,
		kind: simulation.input.mode === "PAYOFF" ? "PAYOFF" : "ADVANCE",
		lateCharges: Math.max(
			0,
			roundMoney(
				simulation.charges - simulation.allocations.reduce((sum, row) => sum + row.charges, 0),
				simulation.currency,
			),
		),
	});
	// Each version carries only open balances and new IDs; receipt history stays immutable.
	next.versions.push({
		effectiveDate: simulation.input.date,
		reason: "ADVANCE",
		receiptId: payment.id,
		revision,
		schedule: simulation.schedule.map(row => ({ ...row, id: `${revision}:${row.number}` })),
		terms: structuredClone(version.terms),
	});
	return next;
}
export function loanInstallmentLateCharges(
	book: LoanContractBook,
	row: ContractInstallment,
	date: string,
): number {
	const { terms } = activeLoanVersion(book);
	const round = (amount: number) => roundMoney(amount, terms.currency);
	const reversed = new Set(
		book.receipts.filter(receipt => receipt.kind === "REVERSAL").map(receipt => receipt.reversesId),
	);
	const earlier = book.receipts.filter(
		receipt =>
			!reversed.has(receipt.id) &&
			receipt.kind === "PAYMENT" &&
			receipt.allocations.some(allocation =>
				book.versions.some(version =>
					version.schedule.some(
						item => item.id === allocation.installmentId && item.dueDate === row.dueDate,
					),
				),
			),
	);
	const lastDate = earlier.reduce(
		(date, receipt) => (receipt.date > date ? receipt.date : date),
		row.dueDate,
	);
	const days = Math.max(0, civilDays(lastDate, date));
	return days
		? round(
				(row.principal + row.interest + row.charges) *
					((earlier.length ? 0 : terms.lateFinePercent) / 100 +
						((terms.lateMonthlyPercent / 100) * days) / 30),
			)
		: 0;
}
export function recordLoanPayment(
	book: LoanContractBook,
	input: Pick<LoanReceipt, "id" | "date" | "amount" | "accountId" | "accountCurrency" | "accountAmount"> & {
		installmentIds?: string[];
		expectedRevision: number;
	},
): LoanContractBook {
	civilDate(input.date);
	positive(input.amount, false);
	if (input.expectedRevision !== book.revision || book.receipts.some(row => row.id === input.id))
		throw new Error("Contrato mudou; revise pagamento");
	const { terms } = activeLoanVersion(book);
	if (input.date < activeLoanVersion(book).effectiveDate || book.successorLoanId)
		throw new Error("Contrato indisponível nesta data");
	const round = (amount: number) => roundMoney(amount, terms.currency);
	const rows = outstandingLoanSchedule(book).filter(
		row => !input.installmentIds || input.installmentIds.includes(row.id),
	);
	let remaining = round(input.amount);
	const allocations: LoanAllocation[] = [];
	let lateCharges = 0;
	for (const row of rows) {
		if (remaining <= 0) break;
		const extra = loanInstallmentLateCharges(book, row, input.date);
		// Late charges must be covered before allocating to an installment; partial late payments remain explicit.
		if (extra > remaining) throw new Error("Pagamento não cobre encargos de atraso");
		remaining = round(remaining - extra);
		lateCharges = round(lateCharges + extra);
		const charges = Math.min(remaining, row.charges);
		remaining = round(remaining - charges);
		const interest = Math.min(remaining, row.interest);
		remaining = round(remaining - interest);
		const principal = Math.min(remaining, row.principal);
		remaining = round(remaining - principal);
		allocations.push({ charges, discount: 0, installmentId: row.id, interest, principal });
	}
	if (remaining > 0 || !allocations.length)
		throw new Error("Pagamento excede saldo das parcelas selecionadas");
	const next = structuredClone(book);
	next.receipts.push({
		accountAmount: input.accountAmount,
		accountCurrency: input.accountCurrency,
		accountId: input.accountId,
		allocations,
		amount: round(input.amount),
		date: input.date,
		id: input.id,
		kind: "PAYMENT",
		lateCharges,
	});
	// Revision also advances for receipts, protecting previews from concurrent partial payments.
	const schedule = outstandingLoanSchedule(next);
	next.revision++;
	next.versions.push({
		effectiveDate: input.date,
		reason: "EDIT",
		receiptId: input.id,
		revision: next.revision,
		schedule: schedule.map(row => ({ ...row, id: `${next.revision}:${row.number}` })),
		terms: structuredClone(terms),
	});
	return next;
}
export function reverseLoanReceipt(
	book: LoanContractBook,
	receiptId: string,
	id: string,
	date: string,
	expectedRevision: number,
): LoanContractBook {
	civilDate(date);
	if (expectedRevision !== book.revision || book.receipts.some(row => row.id === id))
		throw new Error("Contrato mudou");
	const reversed = new Set(book.receipts.filter(row => row.kind === "REVERSAL").map(row => row.reversesId));
	const receipt = book.receipts.findLast(row => row.kind !== "REVERSAL" && !reversed.has(row.id));
	if (!receipt || receipt.id !== receiptId || receipt.kind === "REVERSAL" || receipt.kind === "REFINANCE")
		throw new Error("Reverta operações posteriores primeiro");
	if (date < receipt.date || date < activeLoanVersion(book).effectiveDate)
		throw new Error("Estorno anterior ao pagamento");
	if (activeLoanVersion(book).receiptId !== receiptId)
		throw new Error("Reverta alterações posteriores ao pagamento primeiro");
	const next = structuredClone(book);
	const operationIndex = book.versions.findIndex(
		version => version.receiptId === receiptId && version.reason !== "REVERSAL",
	);
	const previous = book.versions[operationIndex - 1];
	if (!previous) throw new Error("Versão anterior ausente");
	next.revision++;
	next.receipts.push({
		...structuredClone(receipt),
		accountAmount: receipt.accountAmount === null ? null : -receipt.accountAmount,
		allocations: [],
		amount: -receipt.amount,
		date,
		id,
		kind: "REVERSAL",
		lateCharges: -receipt.lateCharges,
		reversesId: receiptId,
	});
	// Snapshot before the latest operation already excludes all earlier payments.
	next.versions.push({
		...structuredClone(previous),
		effectiveDate: date,
		reason: "REVERSAL",
		revision: next.revision,
		schedule: previous.schedule.map(row => ({ ...row, id: `${next.revision}:${row.number}` })),
	});
	return next;
}

/** Refinancing settles debt without inventing an income/outflow; any cash difference is booked explicitly. */
export function restructureLoanContract(
	book: LoanContractBook,
	input: {
		expectedRevision: number;
		successorId: string;
		institutionId: string;
		terms: LoanContractTerms;
		kind: "RENEGOTIATE" | "PORTABILITY";
		settlementAmount: number;
		receiptId: string;
	},
	reference?: LoanReference,
): { source: LoanContractBook; successor: LoanContractBook } {
	if (book.revision !== input.expectedRevision || book.successorLoanId || input.successorId === book.loanId)
		throw new Error("Contrato mudou");
	if (input.terms.currency !== activeLoanVersion(book).terms.currency)
		throw new Error("Renegociação exige mesma moeda");
	const simulation = simulateLoanOperation(
		book,
		{ date: input.terms.startDate, mode: "PAYOFF", quotedAmount: input.settlementAmount },
		reference,
	);
	const source = applyLoanSimulation(
		book,
		simulation,
		{ accountAmount: null, accountCurrency: null, accountId: null, id: input.receiptId },
		reference,
	);
	source.receipts.at(-1)!.kind = "REFINANCE";
	source.versions.at(-1)!.reason = input.kind;
	source.successorLoanId = input.successorId;
	const successor = createLoanContract(input.successorId, input.institutionId, input.terms, reference);
	successor.predecessorLoanId = book.loanId;
	successor.versions[0]!.reason = input.kind;
	return { source, successor };
}

function canonicalLoanValue(value: unknown): string {
	const normalize = (item: unknown): unknown =>
		Array.isArray(item)
			? item.map(normalize)
			: item && typeof item === "object"
				? Object.fromEntries(
						Object.entries(item)
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([key, child]) => [key, normalize(child)]),
					)
				: item;
	return JSON.stringify(normalize(value));
}

export function sameLoanContract(a: unknown, b: unknown): boolean {
	return canonicalLoanValue(a) === canonicalLoanValue(b);
}

/** Receipt counts never stand in for settled installments (partial payments may be repeated). */
export function loanContractSummary(book: LoanContractBook) {
	const terms = activeLoanVersion(book).terms;
	const rows = outstandingLoanSchedule(book);
	return {
		installmentAmount: rows[0]
			? roundMoney(rows[0].principal + rows[0].interest + rows[0].charges, terms.currency)
			: 0,
		paidInstallments: Math.max(0, terms.totalInstallments - rows.length),
		remainingInstallments: rows.length,
		remainingPrincipal: roundMoney(
			rows.reduce((sum, row) => sum + row.principal, 0),
			terms.currency,
		),
		remainingTotal: loanScheduleTotal(rows, terms.currency),
		totalPaid: roundMoney(
			book.receipts.filter(row => row.kind !== "REFINANCE").reduce((sum, row) => sum + row.amount, 0),
			terms.currency,
		),
	};
}
