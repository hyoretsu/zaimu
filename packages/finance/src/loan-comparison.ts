import { civilDate, civilDays, shiftMonths } from "./financial-indicators";
import {
	buildContractSchedule,
	type LoanContractTerms,
	type LoanReference,
	monthlyLoanRate,
} from "./loan-contract";
import { fromMinorUnits, roundMoney, toMinorUnits } from "./money";

export type ComparisonOfferKind = "LOAN" | "PIX_CREDIT" | "EXISTING";
export interface LoanComparisonOffer {
	kind: "LOAN";
	id: string;
	name: string;
	terms: LoanContractTerms;
	/** PRICE + fixed rate only: solve the monthly rate from the bank's quoted installment */
	quotedInstallment?: number | null;
}
export interface PixCreditOffer {
	kind: "PIX_CREDIT";
	id: string;
	name: string;
	currency: string;
	pixDate: string;
	amount: number;
	installments: number;
	/** percent per month, e.g. 4.99 */
	monthlyRate?: number | null;
	quotedInstallment?: number | null;
	quotedTotal?: number | null;
	/** upfront fee and IOF are added to the financed total (charged in installments) */
	fee: number;
	iof: number;
	closingDay: number;
	dueDay: number;
}
export interface ExistingLoanOffer {
	kind: "EXISTING";
	id: string;
	name: string;
	currency: string;
	date: string;
	/** amount needed to pay it off on `date` (treated as amount "received" for comparison) */
	payoffAmount: number;
	installments: { dueDate: string; amount: number }[];
	prepaymentDiscount: boolean;
	/** decimal monthly contract rate used to discount payoff */
	monthlyRate: number;
}
export type ComparisonOffer = LoanComparisonOffer | PixCreditOffer | ExistingLoanOffer;
export interface ComparisonFlow {
	date: string;
	amount: number;
	principal: number;
	interest: number;
	charges: number;
}
export type ComparisonStatus = "OK" | "INVALID" | "MISSING_INDICATOR";
export interface ComparisonResult {
	id: string;
	kind: ComparisonOfferKind;
	status: ComparisonStatus;
	reason?: string;
	currency: string;
	startDate: string;
	received: number;
	financed: number;
	flows: ComparisonFlow[];
	installments: number;
	firstInstallment: number;
	maxInstallment: number;
	lastDueDate: string;
	totalPaid: number;
	totalCost: number;
	/** decimal per month, implied/contract */
	monthlyRate: number | null;
	cetYearly: number | null;
	cetMonthly: number | null;
	presentValue: number | null;
	netCost: number | null;
	prepaymentDiscount: boolean;
	limitCommitted: number | null;
	earlyPayoff: EarlyPayoff | null;
}
export interface EarlyPayoff {
	month: number;
	date: string;
	paidBefore: number;
	payoffAmount: number;
	total: number;
	savings: number;
	cetYearly: number | null;
}
export type ComparisonRanking = "CET" | "NET_COST" | "TOTAL_PAID";
export interface ComparisonOptions {
	/** decimal monthly opportunity rate, null = skip PV */
	opportunityMonthlyRate: number | null;
	reference?: LoanReference;
	payoffMonth?: number | null;
	rankBy?: ComparisonRanking;
}
export interface LoanComparison {
	results: ComparisonResult[];
	/** ids of OK results, best first */
	ranking: string[];
	amountsDiffer: boolean;
	currencyMismatch: boolean;
}

interface UnitFlow {
	date: string;
	principal: number;
	interest: number;
	charges: number;
}
interface OfferFlows {
	currency: string;
	startDate: string;
	received: number;
	financed: number;
	flows: UnitFlow[];
	monthlyRate: number | null;
	prepaymentDiscount: boolean;
	limitCommitted: number | null;
}

const MONTH_DAYS = 365 / 12;
const units = (amount: number, currency: string) => toMinorUnits(roundMoney(amount, currency), currency);
const flowTotal = (flow: UnitFlow) => flow.principal + flow.interest + flow.charges;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const nonNegative = (value: number | null | undefined) =>
	value != null && Number.isFinite(value) && value >= 0;

class MissingIndicatorError extends Error {}

/** Monotonic root search: `f` must be increasing on [lo, hi]. */
function bisect(f: (x: number) => number, lo: number, hi: number): number {
	for (let step = 0; step < 200; step++) {
		const mid = (lo + hi) / 2;
		if (f(mid) < 0) lo = mid;
		else hi = mid;
		if (hi - lo < 1e-14) break;
	}
	return (lo + hi) / 2;
}

/** CMN Res. 3.517: Σ FC_j / (1 + i)^(days_j / 365) = 0 with the amount received at `startDate`. */
export function effectiveAnnualRate(
	startDate: string,
	received: number,
	flows: { date: string; amount: number }[],
): number | null {
	const dated = flows
		.filter(flow => flow.amount !== 0)
		.map(flow => ({ amount: flow.amount, years: civilDays(startDate, flow.date) / 365 }));
	if (!(received > 0) || !dated.length || dated.some(flow => flow.years < 0 || flow.amount < 0))
		return null;
	const npv = (rate: number) => received - sum(dated.map(flow => flow.amount / (1 + rate) ** flow.years));
	const lo = -0.9999;
	let hi = 1;
	if (npv(lo) > 0) return null;
	while (npv(hi) < 0) {
		hi *= 2;
		if (hi > 1e9) return null;
	}
	return bisect(npv, lo, hi);
}

export function solvePriceMonthlyRate(principal: number, count: number, installment: number): number | null {
	if (!(principal > 0) || !Number.isSafeInteger(count) || count < 1 || !(installment > 0)) return null;
	const total = installment * count;
	if (Math.abs(total - principal) < 1e-9 * Math.max(1, principal)) return 0;
	if (total < principal) return null;
	const payment = (rate: number) =>
		rate === 0 ? principal / count : (principal * rate) / (1 - (1 + rate) ** -count);
	let hi = 1;
	while (payment(hi) < installment) hi *= 2;
	return bisect(rate => payment(rate) - installment, 0, hi);
}

function monthDate(year: number, month: number, day: number): string {
	const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return new Date(Date.UTC(year, month, Math.min(day, last), 12)).toISOString().slice(0, 10);
}

/** First invoice closes strictly after the Pix; short months clamp closing and due days. */
export function pixCreditDueDates(
	pixDate: string,
	closingDay: number,
	dueDay: number,
	count: number,
): string[] {
	civilDate(pixDate);
	for (const day of [closingDay, dueDay])
		if (!Number.isInteger(day) || day < 1 || day > 31)
			throw new Error("Dia de fechamento ou vencimento inválido");
	if (!Number.isSafeInteger(count) || count < 1 || count > 1200)
		throw new Error("Número de parcelas inválido");
	const year = Number(pixDate.slice(0, 4));
	const month = Number(pixDate.slice(5, 7)) - 1;
	const firstClosing = monthDate(year, month, closingDay) > pixDate ? month : month + 1;
	const dueOffset = dueDay > closingDay ? 0 : 1;
	return Array.from({ length: count }, (_, index) =>
		monthDate(year, firstClosing + index + dueOffset, dueDay),
	);
}

function assertIndicatorCoverage(terms: LoanContractTerms, reference?: LoanReference) {
	if (!terms.rate.indicator || terms.amortization === "MANUAL") return;
	for (let index = 0; index < terms.totalInstallments; index++) {
		const from = index ? shiftMonths(terms.firstDueDate, index - 1) : terms.startDate;
		if (reference?.(terms.rate, from, shiftMonths(terms.firstDueDate, index)) == null)
			throw new MissingIndicatorError("Indicador sem cobertura para o prazo do contrato");
	}
}

function quotedLoanTerms(offer: LoanComparisonOffer): LoanContractTerms {
	const { terms, quotedInstallment } = offer;
	if (quotedInstallment == null) return terms;
	if (terms.amortization !== "PRICE" || terms.rate.indicator || terms.graceMonths)
		throw new Error("Parcela informada exige Price prefixado sem carência");
	const financed = sum(terms.charges.filter(charge => charge.financed).map(charge => charge.amount));
	const recurring = sum(terms.charges.filter(charge => charge.recurring).map(charge => charge.amount));
	const rate = solvePriceMonthlyRate(
		terms.principalAmount + financed,
		terms.totalInstallments,
		quotedInstallment - recurring,
	);
	if (rate === null) throw new Error("Parcela informada não cobre o valor financiado");
	return { ...terms, rate: { fixedPeriod: "MONTHLY", fixedRate: rate * 100 } };
}

function loanFlows(offer: LoanComparisonOffer, reference?: LoanReference): OfferFlows {
	const terms = quotedLoanTerms(offer);
	assertIndicatorCoverage(terms, reference);
	const { currency } = terms;
	const rows = buildContractSchedule(terms, 1, reference);
	const rates =
		terms.amortization === "MANUAL"
			? [
					monthlyLoanRate(
						{ ...terms, rate: { ...terms.rate, indicator: null } },
						terms.startDate,
						terms.firstDueDate,
					),
				]
			: rows.map((row, index) =>
					monthlyLoanRate(
						terms,
						index ? rows[index - 1]!.dueDate : terms.startDate,
						row.dueDate,
						reference,
					),
				);
	const financed = sum(terms.charges.filter(charge => charge.financed).map(charge => charge.amount));
	return {
		currency,
		financed: units(terms.principalAmount + financed, currency),
		flows: rows.map(row => ({
			charges: units(row.charges, currency),
			date: row.dueDate,
			interest: units(row.interest, currency),
			principal: units(row.principal, currency),
		})),
		limitCommitted: null,
		// Geometric mean of the period rates (constant for fixed-rate contracts).
		monthlyRate: Math.expm1(sum(rates.map(rate => Math.log1p(rate))) / rates.length),
		prepaymentDiscount: terms.discount === "PRESENT_VALUE",
		received: units(terms.principalAmount, currency),
		startDate: terms.startDate,
	};
}

function pixInstallments(offer: PixCreditOffer, financed: number): number[] {
	const { currency, installments: count } = offer;
	if (offer.quotedInstallment != null) {
		if (!(offer.quotedInstallment > 0)) throw new Error("Parcela informada inválida");
		return Array.from({ length: count }, () => units(offer.quotedInstallment!, currency));
	}
	if (offer.quotedTotal != null) {
		if (!(offer.quotedTotal > 0)) throw new Error("Total informado inválido");
		const total = units(offer.quotedTotal, currency);
		const base = Math.floor(total / count);
		return Array.from({ length: count }, (_, index) =>
			index === count - 1 ? total - base * (count - 1) : base,
		);
	}
	if (offer.monthlyRate == null) throw new Error("Informe a taxa, a parcela ou o total");
	if (!nonNegative(offer.monthlyRate)) throw new Error("Taxa mensal inválida");
	const rate = offer.monthlyRate / 100;
	const payment = Math.round(
		rate === 0 ? financed / count : (financed * rate) / (1 - (1 + rate) ** -count),
	);
	let balance = financed;
	return Array.from({ length: count }, (_, index) => {
		const interest = Math.round(balance * rate);
		const principal = index === count - 1 ? balance : Math.min(balance, Math.max(0, payment - interest));
		balance -= principal;
		return principal + interest;
	});
}

/** Amortizes the financed total at the implied rate, then carves fee/IOF out of principal pro rata. */
function splitPixInstallments(
	amounts: number[],
	financed: number,
	charges: number,
	rate: number,
): UnitFlow[] {
	let balance = financed;
	let amortized = 0;
	let chargedSoFar = 0;
	return amounts.map((amount, index) => {
		const accrued = Math.round(balance * rate);
		const principal =
			index === amounts.length - 1 ? balance : Math.min(balance, Math.max(0, amount - accrued));
		balance -= principal;
		amortized += principal;
		const charged = financed ? Math.round((amortized * charges) / financed) : 0;
		const flow = { charges: charged - chargedSoFar, interest: amount - principal };
		chargedSoFar = charged;
		return { ...flow, date: "", principal: principal - flow.charges };
	});
}

function pixFlows(offer: PixCreditOffer): OfferFlows {
	const { currency } = offer;
	if (!(offer.amount > 0) || !nonNegative(offer.fee) || !nonNegative(offer.iof))
		throw new Error("Valor financeiro inválido");
	const dates = pixCreditDueDates(offer.pixDate, offer.closingDay, offer.dueDay, offer.installments);
	const received = units(offer.amount, currency);
	const charges = units(offer.fee, currency) + units(offer.iof, currency);
	const financed = received + charges;
	const amounts = pixInstallments(offer, financed);
	const total = sum(amounts);
	if (total < financed) throw new Error("Total das parcelas menor que o valor financiado");
	const rate =
		offer.quotedInstallment == null && offer.quotedTotal == null
			? offer.monthlyRate! / 100
			: (solvePriceMonthlyRate(financed, amounts.length, total / amounts.length) ?? 0);
	return {
		currency,
		financed,
		flows: splitPixInstallments(amounts, financed, charges, rate).map((flow, index) => ({
			...flow,
			date: dates[index]!,
		})),
		limitCommitted: total,
		monthlyRate: rate,
		prepaymentDiscount: false,
		received,
		startDate: offer.pixDate,
	};
}

function existingFlows(offer: ExistingLoanOffer): OfferFlows {
	const { currency } = offer;
	civilDate(offer.date);
	if (!(offer.payoffAmount > 0) || !nonNegative(offer.monthlyRate))
		throw new Error("Valor financeiro inválido");
	if (!offer.installments.length) throw new Error("Informe as parcelas restantes");
	const rows = offer.installments.toSorted((a, b) => a.dueDate.localeCompare(b.dueDate));
	for (const row of rows)
		if (civilDate(row.dueDate) < offer.date || !(row.amount > 0))
			throw new Error("Parcela restante inválida");
	const received = units(offer.payoffAmount, currency);
	const amounts = rows.map(row => units(row.amount, currency));
	const total = sum(amounts);
	if (total < received) throw new Error("Saldo para quitação maior que as parcelas restantes");
	let cumulative = 0;
	let principalSoFar = 0;
	const flows = amounts.map((amount, index) => {
		cumulative += amount;
		const principal = Math.round((cumulative * received) / total) - principalSoFar;
		principalSoFar += principal;
		return { charges: 0, date: rows[index]!.dueDate, interest: amount - principal, principal };
	});
	return {
		currency,
		financed: received,
		flows,
		limitCommitted: null,
		monthlyRate: offer.monthlyRate,
		prepaymentDiscount: offer.prepaymentDiscount,
		received,
		startDate: offer.date,
	};
}

function offerBasics(offer: ComparisonOffer) {
	if (offer.kind === "LOAN") return { currency: offer.terms.currency, startDate: offer.terms.startDate };
	return { currency: offer.currency, startDate: offer.kind === "PIX_CREDIT" ? offer.pixDate : offer.date };
}

function failedResult(offer: ComparisonOffer, status: ComparisonStatus, reason: string): ComparisonResult {
	const { currency, startDate } = offerBasics(offer);
	return {
		cetMonthly: null,
		cetYearly: null,
		currency,
		earlyPayoff: null,
		financed: 0,
		firstInstallment: 0,
		flows: [],
		id: offer.id,
		installments: 0,
		kind: offer.kind,
		lastDueDate: startDate,
		limitCommitted: null,
		maxInstallment: 0,
		monthlyRate: null,
		netCost: null,
		prepaymentDiscount: false,
		presentValue: null,
		reason,
		received: 0,
		startDate,
		status,
		totalCost: 0,
		totalPaid: 0,
	};
}

function summarize(offer: ComparisonOffer, data: OfferFlows): ComparisonResult {
	const money = (value: number) => fromMinorUnits(value, data.currency);
	const amounts = data.flows.map(flowTotal);
	const totalPaid = sum(amounts);
	const flows = data.flows.map(flow => ({
		amount: money(flowTotal(flow)),
		charges: money(flow.charges),
		date: flow.date,
		interest: money(flow.interest),
		principal: money(flow.principal),
	}));
	const received = money(data.received);
	const cetYearly = effectiveAnnualRate(data.startDate, received, flows);
	return {
		cetMonthly: cetYearly === null ? null : (1 + cetYearly) ** (1 / 12) - 1,
		cetYearly,
		currency: data.currency,
		earlyPayoff: null,
		financed: money(data.financed),
		firstInstallment: money(amounts.find(amount => amount > 0) ?? 0),
		flows,
		id: offer.id,
		installments: flows.length,
		kind: offer.kind,
		lastDueDate: flows.at(-1)?.date ?? data.startDate,
		limitCommitted: data.limitCommitted === null ? null : money(data.limitCommitted),
		maxInstallment: money(Math.max(0, ...amounts)),
		monthlyRate: data.monthlyRate,
		netCost: null,
		prepaymentDiscount: data.prepaymentDiscount,
		presentValue: null,
		received,
		startDate: data.startDate,
		status: "OK",
		totalCost: money(totalPaid - data.received),
		totalPaid: money(totalPaid),
	};
}

function rawFlows(offer: ComparisonOffer, reference?: LoanReference): OfferFlows {
	if (offer.kind === "LOAN") return loanFlows(offer, reference);
	return offer.kind === "PIX_CREDIT" ? pixFlows(offer) : existingFlows(offer);
}

export function offerCashFlows(offer: ComparisonOffer, reference?: LoanReference): ComparisonResult {
	try {
		return summarize(offer, rawFlows(offer, reference));
	} catch (error) {
		const reason = error instanceof Error ? error.message : "Oferta inválida";
		return failedResult(
			offer,
			error instanceof MissingIndicatorError ? "MISSING_INDICATOR" : "INVALID",
			reason,
		);
	}
}

const discountFactor = (rate: number, from: string, through: string) =>
	(1 + rate) ** (Math.max(0, civilDays(from, through)) / MONTH_DAYS);

/** Payoff right after paying `month` installments; charges are never discounted, like the contract simulation. */
export function earlyPayoff(
	offer: ComparisonOffer,
	result: ComparisonResult,
	month: number,
): EarlyPayoff | null {
	if (result.status !== "OK" || !Number.isInteger(month) || month < 1 || month >= result.installments)
		return null;
	const { currency } = result;
	const round = (value: number) => roundMoney(value, currency);
	const rate = offer.kind === "EXISTING" ? offer.monthlyRate : (result.monthlyRate ?? 0);
	const paid = result.flows.slice(0, month);
	const date = paid.at(-1)!.date;
	const payoffAmount = round(
		sum(
			result.flows
				.slice(month)
				.map(flow =>
					result.prepaymentDiscount
						? (flow.principal + flow.interest) / discountFactor(rate, date, flow.date) +
							flow.charges
						: flow.amount,
				),
		),
	);
	const paidBefore = round(sum(paid.map(flow => flow.amount)));
	const total = round(paidBefore + payoffAmount);
	return {
		cetYearly: effectiveAnnualRate(result.startDate, result.received, [
			...paid,
			{ amount: payoffAmount, date },
		]),
		date,
		month,
		paidBefore,
		payoffAmount,
		savings: round(result.totalPaid - total),
		total,
	};
}

function withPresentValue(result: ComparisonResult, rate: number | null): ComparisonResult {
	if (result.status !== "OK" || rate === null) return result;
	const presentValue = roundMoney(
		sum(result.flows.map(flow => flow.amount / discountFactor(rate, result.startDate, flow.date))),
		result.currency,
	);
	return { ...result, netCost: roundMoney(presentValue - result.received, result.currency), presentValue };
}

function rankingKey(result: ComparisonResult, rankBy: ComparisonRanking): number {
	const value =
		rankBy === "TOTAL_PAID"
			? result.totalPaid
			: rankBy === "NET_COST"
				? result.netCost
				: result.cetYearly;
	return value ?? Number.POSITIVE_INFINITY;
}

export function compareLoanOffers(offers: ComparisonOffer[], options: ComparisonOptions): LoanComparison {
	const opportunity = options.opportunityMonthlyRate;
	if (opportunity !== null && !(Number.isFinite(opportunity) && opportunity > -1))
		throw new Error("Taxa de oportunidade inválida");
	const results = offers.map(offer => {
		const result = withPresentValue(offerCashFlows(offer, options.reference), opportunity);
		return options.payoffMonth == null
			? result
			: { ...result, earlyPayoff: earlyPayoff(offer, result, options.payoffMonth) };
	});
	const rankBy = options.rankBy === "NET_COST" && opportunity === null ? "CET" : (options.rankBy ?? "CET");
	const ok = results.filter(result => result.status === "OK");
	const ranking = ok
		.map((result, index) => ({ index, key: rankingKey(result, rankBy), result }))
		.sort((a, b) => a.key - b.key || a.index - b.index)
		.map(row => row.result.id);
	const currencies = new Set(offers.map(offer => offerBasics(offer).currency.trim().toUpperCase()));
	return {
		amountsDiffer: new Set(ok.map(result => result.received)).size > 1,
		currencyMismatch: currencies.size > 1,
		ranking,
		results,
	};
}
