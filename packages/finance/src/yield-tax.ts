export interface TaxBracket {
	upToDays: number | null;
	rate: number;
}
export interface TaxVersion {
	effectiveDate: string;
	applicationOrder: number;
	brackets: TaxBracket[];
}
export interface TaxDefinition {
	id: string;
	name: string;
	isActive: boolean;
	versions: TaxVersion[];
}
const centCreditedAccountTypes = new Set(["CHECKING", "SAVINGS"]);
/** Checking and savings credit their daily net yield in whole cents; other accounts keep full precision. */
export function roundDailyYield(accountType: string | undefined, amount: number) {
	return centCreditedAccountTypes.has(accountType ?? "") ? Math.round(amount * 100 + 1e-9) / 100 : amount;
}
/**
 * Credits whole cents and carries the sub-cent remainder to the next day, so small balances still earn
 * a cent once the accumulated partial yields reach it. Other account types keep full precision.
 */
export function creditDailyYield(accountType: string | undefined, amount: number, carry: number) {
	if (!centCreditedAccountTypes.has(accountType ?? "")) return { carry: 0, credited: amount };
	const pending = carry + amount;
	const credited = Math.floor(pending * 100 + 1e-9) / 100;
	return { carry: Math.max(0, pending - credited), credited };
}
/** DAILY taxes each day's yield inside the balance; ON_REDEMPTION keeps the balance gross and taxes only on withdrawal. */
export type YieldTaxMode = "DAILY" | "ON_REDEMPTION";
export interface TaxSettings {
	yieldTaxIds?: string[] | null;
	yieldTaxMode?: null | string;
	/** Per-tax application keyed by tax id (and `fixed` for the flat rate); missing keys fall back to `yieldTaxMode`. */
	yieldTaxModes?: unknown;
	yieldTaxRate?: number | null;
}
export const fixedTaxKey = "fixed";
export function taxModeOf(settings: TaxSettings | undefined, key: string): YieldTaxMode {
	const modes = settings?.yieldTaxModes;
	const keyed = modes && typeof modes === "object" ? (modes as Record<string, unknown>)[key] : undefined;
	const mode = keyed ?? settings?.yieldTaxMode;
	return mode === "ON_REDEMPTION" ? "ON_REDEMPTION" : "DAILY";
}
/** Explicit mode for every selected tax (and the flat rate), resolving legacy single-mode settings. */
export function resolveTaxModes(settings: TaxSettings | undefined, keys: string[]) {
	return Object.fromEntries(keys.map(key => [key, taxModeOf(settings, key)])) as Record<
		string,
		YieldTaxMode
	>;
}
export function pickTaxModes(modes: Record<string, YieldTaxMode>, keys: string[]) {
	return Object.fromEntries(keys.map(key => [key, modes[key] ?? "DAILY"])) as Record<string, YieldTaxMode>;
}
export function hasRedemptionTax(settings: TaxSettings | undefined) {
	return [...(settings?.yieldTaxIds ?? []), ...(settings?.yieldTaxRate ? [fixedTaxKey] : [])].some(
		key => taxModeOf(settings, key) === "ON_REDEMPTION",
	);
}
export interface YieldLot {
	date: string;
	balance: number;
	/** Contributed amount still in the lot; the taxable gain is `balance - principal`. Absent means no gain. */
	principal?: number;
}
const iofRates = [
	100, 96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16,
	13, 10, 6, 3,
];
export const defaultTaxDefinitions: TaxDefinition[] = [
	{
		id: "iof",
		isActive: true,
		name: "IOF regressivo",
		versions: [
			{
				applicationOrder: 0,
				brackets: [
					...iofRates.map((rate, upToDays) => ({ rate, upToDays })),
					{ rate: 0, upToDays: null },
				],
				effectiveDate: "0001-01-01",
			},
		],
	},
	{
		id: "ir",
		isActive: true,
		name: "IR regressivo",
		versions: [
			{
				applicationOrder: 1,
				brackets: [
					{ rate: 22.5, upToDays: 180 },
					{ rate: 20, upToDays: 360 },
					{ rate: 17.5, upToDays: 720 },
					{ rate: 15, upToDays: null },
				],
				effectiveDate: "0001-01-01",
			},
		],
	},
];
let catalog = defaultTaxDefinitions;
export function setTaxDefinitions(definitions: TaxDefinition[]) {
	catalog = definitions;
}
export function getTaxDefinitions() {
	return catalog;
}
export function validateTaxBrackets(brackets: TaxBracket[]) {
	if (!brackets.length || brackets.length > 100) throw new Error("Informe entre 1 e 100 faixas.");
	let previous = -1;
	for (const [index, bracket] of brackets.entries()) {
		if (!Number.isFinite(bracket.rate) || bracket.rate < 0 || bracket.rate > 100)
			throw new Error("Alíquota deve estar entre 0% e 100%.");
		if (bracket.upToDays === null) {
			if (index !== brackets.length - 1) throw new Error("Somente a última faixa pode ser ilimitada.");
		} else {
			if (!Number.isInteger(bracket.upToDays) || bracket.upToDays <= previous)
				throw new Error("Limites devem ser inteiros crescentes.");
			previous = bracket.upToDays;
		}
	}
	if (brackets.at(-1)?.upToDays !== null) throw new Error("A última faixa deve ser ilimitada.");
}
const dayCache = new Map<string, number>();
/** Epoch milliseconds of a `YYYY-MM-DD` day; memoized because ledgers re-read the same dates thousands of times. */
function dayMs(date: string) {
	const key = date.slice(0, 10);
	let value = dayCache.get(key);
	if (value === undefined) {
		value = Date.parse(key);
		if (dayCache.size > 50_000) dayCache.clear();
		dayCache.set(key, value);
	}
	return value;
}
export function contributionAge(date: string, day: string) {
	return Math.max(0, Math.round((dayMs(day) - dayMs(date)) / 86400000));
}
/** Fraction kept after the daily taxes; ON_REDEMPTION taxes are deferred to the withdrawal. */
export function retainedYieldFraction(
	settings: TaxSettings | undefined,
	contributionDate: string,
	day: string,
	definitions = catalog,
) {
	return retainedFraction(settings, contributionDate, day, definitions, "DAILY");
}
/** Resolves the taxes in force on `day` once, so each lot only needs a bracket lookup by age. */
export function retainedFractionByAge(
	settings: TaxSettings | undefined,
	day: string,
	definitions = catalog,
	mode?: YieldTaxMode,
) {
	const taxes = [...new Set(settings?.yieldTaxIds ?? [])]
		.filter(id => !mode || taxModeOf(settings, id) === mode)
		.map(id => {
			const definition = definitions.find(tax => tax.id === id);
			if (!definition) throw new Error(`Imposto indisponível: ${id}`);
			const version = definition.versions
				.filter(item => item.effectiveDate.slice(0, 10) <= day)
				.toSorted((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
				.at(-1);
			if (!version) throw new Error(`Versão do imposto indisponível: ${id}`);
			return { id, version };
		})
		.toSorted(
			(a, b) => a.version.applicationOrder - b.version.applicationOrder || a.id.localeCompare(b.id),
		);
	const flat =
		!mode || taxModeOf(settings, fixedTaxKey) === mode ? 1 - (settings?.yieldTaxRate ?? 0) / 100 : 1;
	const cache: number[] = [];
	return (age: number) => {
		const cached = cache[age];
		if (cached !== undefined) return cached;
		let retained = 1;
		for (const tax of taxes)
			retained *=
				1 -
				(tax.version.brackets.find(bracket => bracket.upToDays === null || age <= bracket.upToDays)
					?.rate ?? 0) /
					100;
		retained *= flat;
		cache[age] = retained;
		return retained;
	};
}
/** Fraction of a lot's gain kept once the taxes of `mode` (or every tax when omitted) are applied. */
export function retainedFraction(
	settings: TaxSettings | undefined,
	contributionDate: string,
	day: string,
	definitions = catalog,
	mode?: YieldTaxMode,
) {
	return retainedFractionByAge(settings, day, definitions, mode)(contributionAge(contributionDate, day));
}
export function redemptionRetainedFraction(
	settings: TaxSettings | undefined,
	contributionDate: string,
	day: string,
	definitions = catalog,
) {
	return retainedFraction(settings, contributionDate, day, definitions);
}
const matureAges = new WeakMap<TaxDefinition[], number>();
/** Age beyond which no configured bracket changes: the largest finite limit across every tax version. */
function matureAge(definitions: TaxDefinition[]) {
	let age = matureAges.get(definitions);
	if (age === undefined) {
		age = 0;
		for (const definition of definitions)
			for (const version of definition.versions)
				for (const bracket of version.brackets)
					if (bracket.upToDays !== null) age = Math.max(age, bracket.upToDays);
		matureAges.set(definitions, age);
	}
	return age;
}
/** NET daily compounding. Profits retain contribution age; withdrawals use FIFO. */
export class YieldTaxLedger {
	readonly lots: YieldLot[];
	private debt: number;
	constructor(lots: YieldLot[] = [], debt = 0) {
		this.lots = lots.map(lot => ({ ...lot })).sort((a, b) => a.date.localeCompare(b.date));
		this.debt = debt;
	}
	clone() {
		return new YieldTaxLedger(this.lots, this.debt);
	}
	get balance() {
		return this.debt + this.lots.reduce((sum, lot) => sum + lot.balance, 0);
	}
	eligibleBalance(day: string) {
		return Math.max(
			0,
			this.debt +
				this.lots
					.filter(lot => lot.date.slice(0, 10) < day.slice(0, 10))
					.reduce((sum, lot) => sum + lot.balance, 0),
		);
	}
	applyCashFlow(amount: number, day: string) {
		if (amount >= 0) {
			const paid = Math.min(amount, -this.debt);
			this.debt += paid;
			if (amount > paid) {
				const last = this.lots.at(-1);
				this.lots.push({ balance: amount - paid, date: day, principal: amount - paid });
				if (last && last.date.localeCompare(day) > 0)
					this.lots.sort((a, b) => a.date.localeCompare(b.date));
			}
		} else {
			let remaining = -amount;
			while (remaining > 0 && this.lots.length) {
				const lot = this.lots[0]!;
				const used = Math.min(remaining, lot.balance);
				if (lot.principal !== undefined) lot.principal -= (lot.principal * used) / lot.balance;
				lot.balance -= used;
				remaining -= used;
				if (lot.balance <= 0) this.lots.shift();
			}
			this.debt -= remaining;
		}
	}
	netYield(gross: number, settings: TaxSettings | undefined, day: string, definitions = catalog) {
		if (gross < 0) return gross;
		const key = day.slice(0, 10);
		const retained = retainedFractionByAge(settings, day, definitions, "DAILY");
		let total = 0,
			weighted = 0;
		for (const lot of this.lots) {
			if (lot.date.slice(0, 10) >= key) continue;
			total += lot.balance;
			weighted += lot.balance * retained(contributionAge(lot.date, day));
		}
		return total <= 0 ? 0 : (gross * weighted) / total;
	}
	accrueGross(gross: number, settings: TaxSettings | undefined, day: string, definitions = catalog) {
		const key = day.slice(0, 10);
		const lots = this.lots.filter(lot => lot.date.slice(0, 10) < key);
		const total = lots.reduce((sum, lot) => sum + lot.balance, 0);
		if (total <= 0) return 0;
		const retained = retainedFractionByAge(settings, day, definitions, "DAILY");
		let net = 0;
		for (const lot of lots) {
			const amount = ((gross * lot.balance) / total) * retained(contributionAge(lot.date, day));
			lot.balance += amount;
			net += amount;
		}
		return net;
	}
	/**
	 * Lots older than every tax bracket keep an identical retained fraction and are consumed FIFO,
	 * so merging them leaves balances and yields untouched. Redemption taxes need per-lot principal.
	 */
	compactMatured(settings: TaxSettings, day: string, definitions = catalog) {
		if (hasRedemptionTax(settings) || this.lots.length < 3) return;
		const horizon = matureAge(definitions);
		let merged = 1;
		while (merged < this.lots.length && contributionAge(this.lots[merged]!.date, day) > horizon) merged++;
		if (merged < 3) return;
		const [first, ...absorbed] = this.lots.splice(0, merged) as [YieldLot, ...YieldLot[]];
		for (const lot of absorbed) first.balance += lot.balance;
		first.principal = undefined;
		this.lots.unshift(first);
	}
	accrueRecordedNet(amount: number, settings: TaxSettings | undefined, day: string) {
		if (settings) this.compactMatured(settings, day);
		if (amount < 0) {
			this.accrueNet(amount, day);
			return;
		}
		const retained = this.netYield(1, settings, day);
		if (retained > 0) this.accrueGross(amount / retained, settings, day);
		else this.accrueNet(amount, day);
	}
	accrueNet(amount: number, day: string) {
		if (amount < 0) {
			this.applyCashFlow(amount, day);
			return;
		}
		const total = this.lots.reduce((sum, lot) => sum + lot.balance, 0);
		if (total <= 0) {
			this.applyCashFlow(amount, day);
			return;
		}
		for (const lot of this.lots) lot.balance += (amount * lot.balance) / total;
	}
	/** Tax owed if every lot were redeemed on `day`; zero unless taxes are deferred to redemption. */
	deferredTax(settings: TaxSettings | undefined, day: string, definitions = catalog) {
		if (!hasRedemptionTax(settings)) return 0;
		return this.lots.reduce(
			(sum, lot) =>
				sum +
				Math.max(0, lot.balance - (lot.principal ?? lot.balance)) *
					(1 - retainedFraction(settings, lot.date, day, definitions, "ON_REDEMPTION")),
			0,
		);
	}
	netBalance(settings: TaxSettings | undefined, day: string, definitions = catalog) {
		return this.balance - this.deferredTax(settings, day, definitions);
	}
	adjustBalance(balance: number, day: string) {
		this.applyCashFlow(balance - this.balance, day);
	}
}
