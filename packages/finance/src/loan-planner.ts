import {
	dailyForecast,
	type ForecastAccount,
	type ForecastDay,
	type ForecastMovement,
} from "./daily-forecast";
import { civilDate, civilDays, shiftMonths } from "./financial-indicators";
import {
	activeLoanVersion,
	applyLoanSimulation,
	buildContractSchedule,
	type LoanContractBook,
	loanInstallmentLateCharges,
	type LoanReference,
	type LoanSimulationInput,
	outstandingLoanSchedule,
	recordLoanPayment,
	simulateLoanOperation,
} from "./loan-contract";
import { roundMoney } from "./money";

export interface PlannerAccount extends ForecastAccount {
	/** Date funds can first be used, including redemption settlement. */
	availableFrom?: string;
	redemptionDays?: number;
	redemptionCost?: number;
}
export interface PlannerEligibility {
	allAccounts: boolean;
	accountIds: string[];
	includeInvestments: boolean;
	includeAccountIds: string[];
	excludeAccountIds: string[];
}
export interface PlannerLoan {
	book: LoanContractBook;
	paymentAccountId: string;
}
export interface PlannerOperation {
	loanId: string;
	accountId: string;
	input: LoanSimulationInput;
	repeatEveryMonths?: number;
	repetitions?: number;
}
export interface PlannerTransfer {
	fromAccountId: string;
	toAccountId: string;
	date: string;
	amount: number;
	/** Destination currency amount; required for cross-currency transfers. */
	destinationAmount?: number;
}
export interface PlannerScenario {
	id: string;
	name: string;
	operations: PlannerOperation[];
	transfers: PlannerTransfer[];
}
export interface PlannerInput {
	from: string;
	currency: string;
	accounts: PlannerAccount[];
	loans: PlannerLoan[];
	/** Restricts anticipation candidates, never removes other loan commitments from the cash flow. */
	eligibleLoanIds?: string[];
	movements: ForecastMovement[];
	eligibility: PlannerEligibility;
	reserve: number;
	primaryAccountId?: string;
	accountReserves?: Record<string, number>;
	dataIssues: string[];
}
export interface PlannerResult {
	scenario: PlannerScenario;
	id: string;
	name: string;
	through: string;
	status: "SAFE" | "UNSAFE" | "UNAVAILABLE";
	issues: string[];
	firstDeficit: { date: string; accountId: string | null; amount: number } | null;
	minimumBalance: number;
	minimumDate: string;
	terminalWealth: number;
	advantage: number;
	discount: number;
	outlay: number;
	lostYield: number;
	costs: number;
	days: {
		date: string;
		balance: number;
		accounts: Record<string, number>;
		income: number;
		expenses: number;
	}[];
	months: { month: string; balance: number; minimumBalance: number; income: number; expenses: number }[];
}
export interface PlannerRuntime {
	rate?: Parameters<typeof dailyForecast>[0]["rate"];
	netYield?: Parameters<typeof dailyForecast>[0]["netYield"];
	settleYield?: Parameters<typeof dailyForecast>[0]["settleYield"];
	reference?: LoanReference;
}
export function eligiblePlannerAccounts(accounts: PlannerAccount[], rule: PlannerEligibility): Set<string> {
	return new Set(
		accounts
			.filter(account => {
				if (rule.excludeAccountIds.includes(account.id)) return false;
				if (rule.includeAccountIds.includes(account.id)) return true;
				if (!rule.allAccounts && !rule.accountIds.includes(account.id)) return false;
				return rule.includeInvestments || !["SAVINGS", "INVESTMENT"].includes(account.type);
			})
			.map(account => account.id),
	);
}
export function loanPlannerHorizon(input: PlannerInput): string {
	return input.loans
		.filter(loan => !input.eligibleLoanIds || input.eligibleLoanIds.includes(loan.book.loanId))
		.flatMap(loan => outstandingLoanSchedule(loan.book).map(row => row.dueDate))
		.reduce((latest, date) => (date > latest ? date : latest), civilDate(input.from));
}
function nextDay(date: string): string {
	const value = new Date(`${date}T12:00:00Z`);
	value.setUTCDate(value.getUTCDate() + 1);
	return value.toISOString().slice(0, 10);
}
export function evaluateLoanScenario(
	input: PlannerInput,
	scenario: PlannerScenario,
	runtime: PlannerRuntime = {},
	baseline?: PlannerResult,
): PlannerResult {
	civilDate(input.from);
	if (!Number.isFinite(input.reserve) || input.reserve < 0) throw new Error("Reserva inválida");
	const through = loanPlannerHorizon(input);
	const eligible = eligiblePlannerAccounts(input.accounts, input.eligibility);
	const issues = [...input.dataIssues];
	const isLiquid = (row: PlannerAccount, date: string) => {
		const investment = ["SAVINGS", "INVESTMENT"].includes(row.type);
		if (investment && !row.availableFrom && row.redemptionDays === undefined) return false;
		return (
			date >= (row.availableFrom ?? input.from) &&
			civilDays(input.from, date) >= (row.redemptionDays ?? 0)
		);
	};
	for (const row of input.accounts)
		if (
			eligible.has(row.id) &&
			["SAVINGS", "INVESTMENT"].includes(row.type) &&
			!row.availableFrom &&
			row.redemptionDays === undefined
		)
			issues.push("Informe condições de liquidez dos investimentos incluídos");
	const movements = structuredClone(
		input.movements.filter(row => row.date >= input.from && row.date <= through),
	);
	const books = new Map(input.loans.map(row => [row.book.loanId, structuredClone(row.book)]));
	let discount = 0,
		outlay = 0,
		costs = 0;
	const convert = (amount: number, currency: string, date: string) => {
		if (currency === input.currency) return amount;
		const factor = runtime.rate?.(currency, date);
		if (factor == null || !Number.isFinite(factor) || factor <= 0)
			throw new Error(`Cotação indisponível: ${currency}`);
		return amount * factor;
	};
	const account = (id: string) => {
		const found = input.accounts.find(row => row.id === id);
		if (!found) throw new Error("Conta indisponível");
		return found;
	};
	const funding = (id: string, date: string) => {
		const row = account(id);
		if (!eligible.has(id)) issues.push(`Conta excluída do financiamento: ${id}`);
		const available = row.availableFrom ?? input.from;
		if (date < available || civilDays(input.from, date) < (row.redemptionDays ?? 0))
			issues.push(`Resgate indisponível na data: ${id}`);
		return row;
	};
	try {
		// Reprice only disposable future schedules; recorded payments and overdue amounts remain immutable.
		for (const book of books.values()) {
			const version = activeLoanVersion(book);
			if (!version.terms.rate.indicator || version.terms.amortization === "MANUAL") continue;
			const outstanding = outstandingLoanSchedule(book);
			const future = outstanding.filter(row => row.dueDate > input.from);
			if (!future.length) continue;
			const first = future[0]!;
			const prior =
				outstanding.find(row => row.number === first.number - 1)?.dueDate ??
				shiftMonths(first.dueDate, -1);
			const futureGrace = future.filter(
				row => row.number <= version.terms.graceMonths && row.principal === 0,
			);
			const oldCapitalization =
				version.terms.graceInterest === "CAPITALIZE"
					? futureGrace.reduce((sum, row) => {
							const priorRow = book.versions
								.toReversed()
								.flatMap(entry => entry.schedule)
								.find(item => item.number === row.number - 1 && item.dueDate < row.dueDate);
							const before =
								priorRow?.balance ??
								version.terms.principalAmount +
									version.terms.charges
										.filter(charge => charge.financed)
										.reduce((sum, charge) => sum + charge.amount, 0);
							return sum + row.balance - before;
						}, 0)
					: 0;
			const terms = {
				...structuredClone(version.terms),
				charges: [],
				firstDueDate: first.dueDate,
				graceMonths: futureGrace.length,
				principalAmount: future.reduce((sum, row) => sum + row.principal, 0) - oldCapitalization,
				startDate: prior,
				totalInstallments: future.length,
			};
			if (terms.principalAmount <= 0) continue;
			const projected = buildContractSchedule(terms, book.revision, runtime.reference);
			version.schedule = [
				...outstanding.filter(row => row.dueDate <= input.from),
				...projected.map((row, index) => ({
					...row,
					charges: future[index]!.charges,
					id: future[index]!.id,
					number: future[index]!.number,
				})),
			];
		}
		for (const transfer of scenario.transfers) {
			civilDate(transfer.date);
			if (
				transfer.date < input.from ||
				transfer.date > through ||
				!Number.isFinite(transfer.amount) ||
				transfer.amount <= 0 ||
				transfer.fromAccountId === transfer.toAccountId
			)
				throw new Error("Transferência inválida");
			const origin = funding(transfer.fromAccountId, transfer.date);
			const destination = account(transfer.toAccountId);
			if (origin.currency !== destination.currency && transfer.destinationAmount === undefined)
				throw new Error("Informe conversão do resgate");
			movements.push({
				amount: transfer.amount,
				currency: origin.currency,
				date: transfer.date,
				destinationAccountId: destination.id,
				destinationAmount: transfer.destinationAmount,
				originAccountId: origin.id,
				type: "TRANSFER",
			});
			const fee = origin.redemptionCost ?? 0;
			if (fee) {
				costs += convert(fee, origin.currency ?? input.currency, transfer.date);
				movements.push({
					amount: fee,
					currency: origin.currency,
					date: transfer.date,
					originAccountId: origin.id,
					type: "EXPENSE",
				});
			}
		}
		const operations = scenario.operations
			.flatMap(operation => {
				const repetitions = operation.repetitions ?? 1;
				if (
					!Number.isSafeInteger(repetitions) ||
					repetitions < 1 ||
					repetitions > 1200 ||
					(repetitions > 1 &&
						(!Number.isInteger(operation.repeatEveryMonths) || operation.repeatEveryMonths! < 1))
				)
					throw new Error("Repetição inválida");
				return Array.from({ length: repetitions }, (_, index) => ({
					...operation,
					input: {
						...operation.input,
						date: shiftMonths(operation.input.date, index * (operation.repeatEveryMonths ?? 1)),
					},
				}));
			})
			.sort((a, b) => a.input.date.localeCompare(b.input.date) || a.loanId.localeCompare(b.loanId));
		for (const operation of operations) {
			const date = civilDate(operation.input.date);
			if (date < input.from) throw new Error("Operação fora do horizonte");
			const loan = input.loans.find(row => row.book.loanId === operation.loanId);
			let book = books.get(operation.loanId);
			if (
				!loan ||
				!book ||
				(input.eligibleLoanIds && !input.eligibleLoanIds.includes(operation.loanId))
			)
				throw new Error("Empréstimo indisponível");
			if (!outstandingLoanSchedule(book).length) continue;
			if (date > through) throw new Error("Operação fora do horizonte");
			const payer = funding(operation.accountId, date);
			const currency = activeLoanVersion(book).terms.currency;
			// Regular installments before the proposed date remain in the cash flow and reduce the book first.
			for (const row of outstandingLoanSchedule(book).filter(row => row.dueDate < date)) {
				const paidDate = row.dueDate < input.from ? input.from : row.dueDate;
				const amount =
					row.principal +
					row.interest +
					row.charges +
					loanInstallmentLateCharges(book, row, paidDate);
				if (amount <= 0) {
					if (amount < 0)
						movements.push({
							amount: -amount,
							currency,
							date: paidDate,
							destinationAccountId: loan.paymentAccountId,
							type: "INCOME",
						});
					activeLoanVersion(book).schedule = outstandingLoanSchedule(book).filter(
						item => item.id !== row.id,
					);
					continue;
				}
				movements.push({
					amount,
					currency,
					date: row.dueDate < input.from ? input.from : row.dueDate,
					originAccountId: loan.paymentAccountId,
					type: "EXPENSE",
				});
				book = recordLoanPayment(book, {
					accountAmount: null,
					accountCurrency: null,
					accountId: null,
					amount,
					date:
						paidDate < activeLoanVersion(book).effectiveDate
							? activeLoanVersion(book).effectiveDate
							: paidDate,
					expectedRevision: book.revision,
					id: `forecast:${book.revision}:${row.id}`,
				});
			}
			if (!outstandingLoanSchedule(book).length) {
				books.set(operation.loanId, book);
				continue;
			}
			const simulationInput = structuredClone(operation.input);
			if (simulationInput.mode === "SELECTED") {
				const originalRows = outstandingLoanSchedule(loan.book);
				const dates = simulationInput.installmentIds?.map(
					id => originalRows.find(row => row.id === id)?.dueDate,
				);
				simulationInput.installmentIds = dates?.map(
					dueDate =>
						outstandingLoanSchedule(book!).find(row => row.dueDate === dueDate)?.id ?? "missing",
				);
			}
			if (
				(simulationInput.mode === "FRONT" || simulationInput.mode === "BACK") &&
				(operation.repetitions ?? 1) > 1
			)
				simulationInput.count = Math.min(
					simulationInput.count ?? 1,
					outstandingLoanSchedule(book).length,
				);
			const simulation = simulateLoanOperation(book, simulationInput, runtime.reference);
			const debit =
				convert(simulation.amount, currency, date) /
				convert(1, payer.currency ?? input.currency, date);
			book = applyLoanSimulation(
				book,
				simulation,
				{
					accountAmount: debit,
					accountCurrency: payer.currency ?? input.currency,
					accountId: payer.id,
					id: `scenario:${scenario.id}:${book.revision}`,
				},
				runtime.reference,
			);
			books.set(operation.loanId, book);
			if (["SAVINGS", "INVESTMENT"].includes(payer.type) && payer.redemptionCost) {
				costs += convert(payer.redemptionCost, payer.currency ?? input.currency, date);
				movements.push({
					amount: payer.redemptionCost,
					currency: payer.currency,
					date,
					originAccountId: payer.id,
					type: "EXPENSE",
				});
			}
			discount += convert(simulation.discount, currency, date);
			outlay += convert(simulation.amount, currency, date);
			movements.push({
				amount: debit,
				currency: payer.currency,
				date,
				originAccountId: payer.id,
				type: "EXPENSE",
			});
		}
		for (const loan of input.loans) {
			const book = books.get(loan.book.loanId)!;
			account(loan.paymentAccountId);
			for (const row of outstandingLoanSchedule(book)) {
				const date = row.dueDate < input.from ? input.from : row.dueDate;
				const amount =
					row.principal + row.interest + row.charges + loanInstallmentLateCharges(book, row, date);
				movements.push({
					amount: Math.abs(amount),
					currency: activeLoanVersion(book).terms.currency,
					date,
					destinationAccountId: amount < 0 ? loan.paymentAccountId : undefined,
					originAccountId: amount < 0 ? undefined : loan.paymentAccountId,
					type: amount < 0 ? "INCOME" : "EXPENSE",
				});
			}
		}
		const days = dailyForecast({
			...runtime,
			accounts: input.accounts,
			currency: input.currency,
			from: input.from,
			movements,
			netYield: (account, balance, day, ledger) =>
				day === input.from ? 0 : (runtime.netYield?.(account, balance, day, ledger) ?? 0),
			primaryAccountId: input.primaryAccountId,
			strictAccounts: true,
			through,
		});
		let firstDeficit: PlannerResult["firstDeficit"] = null;
		let minimumBalance = Number.POSITIVE_INFINITY,
			minimumDate = input.from;
		const monthly = new Map<string, PlannerResult["months"][number]>();
		const output = days.map(day => {
			const balance = input.accounts
				.filter(row => eligible.has(row.id) && isLiquid(row, day.date))
				.reduce(
					(sum, row) =>
						sum +
						convert(day.balances.get(row.id) ?? 0, row.currency ?? input.currency, day.date),
					0,
				);
			if (balance < minimumBalance) {
				minimumBalance = balance;
				minimumDate = day.date;
			}
			for (const row of input.accounts) {
				const amount = day.balances.get(row.id) ?? 0;
				if (!firstDeficit && amount < (input.accountReserves?.[row.id] ?? 0) - 0.000001)
					firstDeficit = { accountId: row.id, amount, date: day.date };
			}
			if (!firstDeficit && balance < input.reserve - 0.000001)
				firstDeficit = { accountId: null, amount: balance, date: day.date };
			const month = day.date.slice(0, 7);
			const summary = monthly.get(month) ?? {
				balance,
				expenses: 0,
				income: 0,
				minimumBalance: balance,
				month,
			};
			summary.balance = balance;
			summary.minimumBalance = Math.min(summary.minimumBalance, balance);
			summary.income += day.income;
			summary.expenses += day.expenses;
			monthly.set(month, summary);
			return {
				accounts: Object.fromEntries(day.balances),
				balance,
				date: day.date,
				expenses: day.expenses,
				income: day.income,
			};
		});
		const terminal = days.at(-1)!;
		const debt = [...books.values()]
			.flatMap(book =>
				outstandingLoanSchedule(book)
					.filter(row => row.dueDate > through)
					.map(row => ({
						amount: row.principal,
						currency: activeLoanVersion(book).terms.currency,
					})),
			)
			.reduce((sum, row) => sum + convert(row.amount, row.currency, through), 0);
		const terminalWealth = roundMoney(
			input.accounts
				.filter(row => isLiquid(row, through))
				.reduce(
					(sum, row) =>
						sum +
						convert(terminal.balances.get(row.id) ?? 0, row.currency ?? input.currency, through),
					0,
				) - debt,
			input.currency,
		);
		const gain = forecastYield(days, movements, input.currency, convert);
		const baseGain = baseline
			? baseline.days.reduce((sum, day) => sum + day.income, 0) -
				input.movements
					.filter(row => row.type === "INCOME")
					.reduce(
						(sum, row) => sum + convert(row.amount, row.currency ?? input.currency, row.date),
						0,
					)
			: gain;
		return {
			advantage: baseline ? roundMoney(terminalWealth - baseline.terminalWealth, input.currency) : 0,
			costs: roundMoney(costs, input.currency),
			days: output,
			discount: roundMoney(discount, input.currency),
			firstDeficit,
			id: scenario.id,
			issues,
			lostYield: roundMoney(baseGain - gain, input.currency),
			minimumBalance: roundMoney(minimumBalance, input.currency),
			minimumDate,
			months: [...monthly.values()],
			name: scenario.name,
			outlay: roundMoney(outlay, input.currency),
			scenario: structuredClone(scenario),
			status: issues.length ? "UNAVAILABLE" : firstDeficit ? "UNSAFE" : "SAFE",
			terminalWealth,
			through,
		};
	} catch (error) {
		return {
			advantage: 0,
			costs: 0,
			days: [],
			discount: 0,
			firstDeficit: null,
			id: scenario.id,
			issues: [...issues, error instanceof Error ? error.message : "Dados indisponíveis"],
			lostYield: 0,
			minimumBalance: 0,
			minimumDate: input.from,
			months: [],
			name: scenario.name,
			outlay: 0,
			scenario: structuredClone(scenario),
			status: "UNAVAILABLE",
			terminalWealth: 0,
			through,
		};
	}
}
function forecastYield(
	days: ForecastDay[],
	movements: ForecastMovement[],
	currency: string,
	convert: (amount: number, currency: string, date: string) => number,
): number {
	return (
		days.reduce((sum, day) => sum + day.income, 0) -
		movements
			.filter(row => row.type === "INCOME")
			.reduce((sum, row) => sum + convert(row.amount, row.currency ?? currency, row.date), 0)
	);
}
export const baselineLoanScenario: PlannerScenario = {
	id: "baseline",
	name: "Manter cronograma",
	operations: [],
	transfers: [],
};
export function rankLoanScenarios(results: PlannerResult[]): PlannerResult[] {
	return results.toSorted(
		(a, b) =>
			Number(b.status === "SAFE") - Number(a.status === "SAFE") ||
			b.advantage - a.advantage ||
			b.minimumBalance - a.minimumBalance ||
			a.id.localeCompare(b.id),
	);
}
/** Bounded reproducible beam search. Reports evaluated candidates rather than claiming a global optimum. */
export async function searchLoanScenarios(
	input: PlannerInput,
	options: {
		budget: number;
		accountId: string;
		runtime?: PlannerRuntime;
		signal?: AbortSignal;
		onProgress?: (done: number, total: number) => void;
	},
): Promise<{ baseline: PlannerResult; ranked: PlannerResult[]; evaluated: number; dates: string[] }> {
	if (!Number.isFinite(options.budget) || options.budget <= 0) throw new Error("Orçamento inválido");
	const baseline = evaluateLoanScenario(input, baselineLoanScenario, options.runtime);
	const horizon = loanPlannerHorizon(input);
	const dates = new Set(
		[
			input.from,
			...input.movements.filter(row => row.type === "INCOME").map(row => row.date),
			...input.accounts.map(row => row.availableFrom).filter((date): date is string => !!date),
			...input.loans.flatMap(row => outstandingLoanSchedule(row.book).map(item => item.dueDate)),
		].filter(date => date >= input.from && date <= horizon),
	);
	const scenarios: PlannerScenario[] = [];
	for (const date of [...dates].sort())
		for (const loan of input.loans.filter(
			loan => !input.eligibleLoanIds || input.eligibleLoanIds.includes(loan.book.loanId),
		)) {
			const count = outstandingLoanSchedule(loan.book).filter(
				row => row.dueDate >= date || date === input.from,
			).length;
			if (!count) continue;
			for (const mode of ["FRONT", "BACK"] as const)
				for (const quantity of [...new Set([1, Math.ceil(count / 4), Math.ceil(count / 2)])].filter(
					quantity => quantity < count,
				))
					scenarios.push({
						id: `${date}:${loan.book.loanId}:${mode}:${quantity}`,
						name: `${quantity} parcelas - ${date}`,
						operations: [
							{
								accountId: options.accountId,
								input: { count: quantity, date, mode },
								loanId: loan.book.loanId,
							},
						],
						transfers: [],
					});
			scenarios.push({
				id: `${date}:${loan.book.loanId}:PAYOFF`,
				name: `Quitar - ${date}`,
				operations: [
					{
						accountId: options.accountId,
						input: { date, mode: "PAYOFF" },
						loanId: loan.book.loanId,
					},
				],
				transfers: [],
			});
			for (const fraction of [0.25, 0.5, 1])
				for (const mode of ["REDUCE_TERM", "REDUCE_PAYMENT"] as const)
					scenarios.push({
						id: `${date}:${loan.book.loanId}:${mode}:${fraction}`,
						name: `${mode === "REDUCE_TERM" ? "Reduzir prazo" : "Reduzir prestação"} - ${date}`,
						operations: [
							{
								accountId: options.accountId,
								input: {
									amount:
										(options.budget * fraction) /
										(activeLoanVersion(loan.book).terms.currency === input.currency
											? 1
											: (options.runtime?.rate?.(
													activeLoanVersion(loan.book).terms.currency,
													date,
												) ?? Number.NaN)),
									date,
									mode,
								},
								loanId: loan.book.loanId,
							},
						],
						transfers: [],
					});
		}
	let done = 0;
	const evaluated: { result: PlannerResult; scenario: PlannerScenario }[] = [];
	const perLoan = new Map<string, { result: PlannerResult; scenario: PlannerScenario }>();
	const run = async (scenario: PlannerScenario) => {
		options.signal?.throwIfAborted();
		const result = evaluateLoanScenario(input, scenario, options.runtime, baseline);
		if (result.outlay + result.costs <= options.budget && result.status !== "UNAVAILABLE") {
			evaluated.push({ result, scenario });
			const id = scenario.operations.length === 1 ? scenario.operations[0]!.loanId : null;
			if (id && result.status === "SAFE") {
				const previous = perLoan.get(id);
				if (!previous || result.advantage > previous.result.advantage)
					perLoan.set(id, { result, scenario });
			}
			evaluated.sort(
				(a, b) =>
					Number(b.result.status === "SAFE") - Number(a.result.status === "SAFE") ||
					b.result.advantage - a.result.advantage ||
					b.result.minimumBalance - a.result.minimumBalance ||
					a.scenario.id.localeCompare(b.scenario.id),
			);
			if (evaluated.length > 20) evaluated.pop();
		}
		done++;
		options.onProgress?.(done, Math.max(done, scenarios.length));
		if (done % 8 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
	};
	for (const scenario of scenarios) await run(scenario);
	const compare = (
		a: { result: PlannerResult; scenario: PlannerScenario },
		b: { result: PlannerResult; scenario: PlannerScenario },
	) => b.result.advantage - a.result.advantage || a.scenario.id.localeCompare(b.scenario.id);
	const representatives = [...perLoan.values()].sort(compare).slice(0, 12);
	const top = [
		...representatives,
		...evaluated
			.filter(
				row =>
					row.result.status === "SAFE" &&
					!representatives.some(other => other.scenario.id === row.scenario.id),
			)
			.sort(compare),
	].slice(0, 12);
	// Refine neighboring days and combine operations on different loans within the same total budget.
	for (const item of top.slice(0, 4))
		for (let offset = -7; offset <= 7; offset++) {
			if (!offset) continue;
			const operation = item.scenario.operations[0]!;
			let date = operation.input.date;
			const d = new Date(`${date}T12:00:00Z`);
			d.setUTCDate(d.getUTCDate() + offset);
			date = d.toISOString().slice(0, 10);
			if (date < input.from || date > horizon) continue;
			dates.add(date);
			await run({
				...item.scenario,
				id: `${item.scenario.id}:${offset}`,
				operations: [{ ...operation, input: { ...operation.input, date } }],
			});
		}
	for (let i = 0; i < top.length; i++)
		for (let j = i + 1; j < top.length; j++) {
			const a = top[i]!,
				b = top[j]!;
			if (
				a.scenario.operations[0]!.loanId === b.scenario.operations[0]!.loanId ||
				a.result.outlay + b.result.outlay + a.result.costs + b.result.costs > options.budget
			)
				continue;
			await run({
				id: `combined:${a.scenario.id}:${b.scenario.id}`,
				name: "Antecipação combinada",
				operations: [...a.scenario.operations, ...b.scenario.operations],
				transfers: [],
			});
		}
	return {
		baseline,
		dates: [...dates].sort(),
		evaluated: done,
		ranked: rankLoanScenarios([baseline, ...evaluated.map(row => row.result).slice(0, 19)]),
	};
}
