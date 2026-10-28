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
export interface TaxSettings {
	yieldTaxIds?: string[] | null;
	yieldTaxRate?: number | null;
}
export interface YieldLot {
	date: string;
	balance: number;
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
export function contributionAge(date: string, day: string) {
	return Math.max(0, Math.round((Date.parse(day.slice(0, 10)) - Date.parse(date.slice(0, 10))) / 86400000));
}
export function retainedYieldFraction(
	settings: TaxSettings | undefined,
	contributionDate: string,
	day: string,
	definitions = catalog,
) {
	const taxes = [...new Set(settings?.yieldTaxIds ?? [])]
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
	const age = contributionAge(contributionDate, day);
	let retained = 1;
	for (const tax of taxes)
		retained *=
			1 -
			(tax.version.brackets.find(bracket => bracket.upToDays === null || age <= bracket.upToDays)
				?.rate ?? 0) /
				100;
	return retained * (1 - (settings?.yieldTaxRate ?? 0) / 100);
}
/** NET daily compounding. Profits retain contribution age; withdrawals use FIFO. */
export class YieldTaxLedger {
	readonly lots: YieldLot[];
	private debt: number;
	constructor(lots: YieldLot[] = [], debt = 0) {
		this.lots = lots.map(lot => ({ ...lot })).sort((a, b) => a.date.localeCompare(b.date));
		this.debt = debt;
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
				this.lots.push({ balance: amount - paid, date: day });
				this.lots.sort((a, b) => a.date.localeCompare(b.date));
			}
		} else {
			let remaining = -amount;
			while (remaining > 0 && this.lots.length) {
				const lot = this.lots[0]!;
				const used = Math.min(remaining, lot.balance);
				lot.balance -= used;
				remaining -= used;
				if (lot.balance <= 0) this.lots.shift();
			}
			this.debt -= remaining;
		}
	}
	netYield(gross: number, settings: TaxSettings | undefined, day: string, definitions = catalog) {
		if (gross < 0) return gross;
		const lots = this.lots.filter(lot => lot.date.slice(0, 10) < day.slice(0, 10));
		const total = lots.reduce((sum, lot) => sum + lot.balance, 0);
		return total <= 0
			? 0
			: lots.reduce(
					(sum, lot) =>
						sum +
						((gross * lot.balance) / total) *
							retainedYieldFraction(settings, lot.date, day, definitions),
					0,
				);
	}
	accrueGross(gross: number, settings: TaxSettings | undefined, day: string, definitions = catalog) {
		const lots = this.lots.filter(lot => lot.date.slice(0, 10) < day.slice(0, 10));
		const total = lots.reduce((sum, lot) => sum + lot.balance, 0);
		if (total <= 0) return 0;
		let net = 0;
		for (const lot of lots) {
			const amount =
				((gross * lot.balance) / total) * retainedYieldFraction(settings, lot.date, day, definitions);
			lot.balance += amount;
			net += amount;
		}
		return net;
	}
	accrueRecordedNet(amount: number, settings: TaxSettings | undefined, day: string) {
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
	adjustBalance(balance: number, day: string) {
		this.applyCashFlow(balance - this.balance, day);
	}
}
