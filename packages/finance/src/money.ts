/** Monetary values always identify their denomination. Rates/points are not Money. */
export interface Money {
	amount: number;
	currency: string;
}

const precision = new Map<string, number>();
export function normalizeCurrency(value: string): string {
	const currency = value.trim().toUpperCase();
	if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError("Código de moeda inválido");
	return currency;
}

export function currencyDigits(value: string): number {
	const currency = normalizeCurrency(value);
	const cached = precision.get(currency);
	if (cached !== undefined) return cached;
	const digits =
		new Intl.NumberFormat("en", { currency, style: "currency" }).resolvedOptions()
			.maximumFractionDigits ?? 2;
	precision.set(currency, digits);
	return digits;
}

export function currencyScale(currency = "BRL"): number {
	return 10 ** currencyDigits(currency);
}

/** Strict boundary conversion. Do not truncate fractions incompatible with the currency. */
export function toMinorUnits(amount: number, currency = "BRL", minimum = 0): number {
	const scale = currencyScale(currency);
	const units = Math.round(amount * scale);
	if (
		!Number.isFinite(amount) ||
		!Number.isSafeInteger(units) ||
		units < minimum ||
		Math.abs(units / scale - amount) > 1e-8
	)
		throw new RangeError(`Valor incompatível com a precisão de ${currency}`);
	return units;
}

export function fromMinorUnits(units: number, currency = "BRL"): number {
	if (!Number.isSafeInteger(units)) throw new RangeError("Valor monetário fora do limite seguro");
	return units / currencyScale(currency);
}

export function roundMoney(amount: number, currency = "BRL"): number {
	const scale = currencyScale(currency);
	if (!Number.isFinite(amount)) throw new RangeError("Valor monetário inválido");
	const units = Math.round(
		(amount + Math.sign(amount) * Number.EPSILON * Math.max(1, Math.abs(amount))) * scale,
	);
	return fromMinorUnits(units, currency);
}

/** Convert cumulative fixed allocations so rounded participants conserve their total. */
export function convertFixedSplit<
	T extends
		| {
				currency?: string;
				mode: string;
				participants: Array<{ debtPersonId: string; fixedAmount?: number }>;
		  }
		| null
		| undefined,
>(split: T, rate: number, from: string, to: string): T {
	if (split?.mode !== "FIXED") return split;
	from = split.currency ?? from;
	if (from === to) return split;
	if (!Number.isFinite(rate) || rate <= 0) throw new RangeError("Cotação inválida");
	let sourceUnits = 0;
	let allocated = 0;
	const participants = split.participants.map(participant => {
		sourceUnits += toMinorUnits(participant.fixedAmount ?? 0, from);
		const cumulative = toMinorUnits(roundMoney(fromMinorUnits(sourceUnits, from) * rate, to), to);
		const fixedAmount = fromMinorUnits(cumulative - allocated, to);
		allocated = cumulative;
		return { ...participant, fixedAmount };
	});
	return { ...split, currency: to, participants } as T;
}

export async function convertFixedSplitAtDate<
	T extends
		| {
				currency?: string;
				mode: string;
				participants: Array<{ debtPersonId: string; fixedAmount?: number }>;
		  }
		| null
		| undefined,
>(
	split: T,
	date: string | Date,
	from: string,
	to: string,
	lookup: (date: string | Date, from: string, to: string) => Promise<number>,
): Promise<T> {
	const source = split?.currency ?? from;
	if (split?.mode !== "FIXED" || source === to) return split;
	return convertFixedSplit(split, await lookup(date, source, to), source, to);
}

export function formatMoney(amount: number, currency: string, locale?: string): string {
	return new Intl.NumberFormat(locale, { currency: normalizeCurrency(currency), style: "currency" }).format(
		amount,
	);
}

export function addMoney(values: readonly Money[], currency: string): Money {
	let units = 0;
	for (const value of values) {
		if (normalizeCurrency(value.currency) !== normalizeCurrency(currency))
			throw new RangeError("Converta moedas antes de somar");
		units += toMinorUnits(value.amount, currency, -Number.MAX_SAFE_INTEGER);
		if (!Number.isSafeInteger(units)) throw new RangeError("Total monetário fora do limite seguro");
	}
	return { amount: fromMinorUnits(units, currency), currency: normalizeCurrency(currency) };
}
