import { currencyRateDate, type CurrencyRates, normalizeCurrency } from "./currency-exchange";

interface Demand {
	date: string;
	source: string;
}
interface SnapshotKey {
	date: string;
	baseCurrency: string;
}
type Snapshot = SnapshotKey & { rates: CurrencyRates };

/** Only complete pairs bypass ensure(): both base snapshots remain mandatory. */
export async function storedCurrencyFactors(
	requests: readonly Demand[],
	targetInput: string,
	read: (keys: SnapshotKey[]) => Promise<Snapshot[]>,
) {
	const target = normalizeCurrency(targetInput);
	const normalized = requests.flatMap(request => {
		try {
			return [
				{ ...request, day: currencyRateDate(request.date), from: normalizeCurrency(request.source) },
			];
		} catch {
			// The regular per-pair path reports invalid/missing factors independently.
			return [];
		}
	});
	const keys = new Map<string, SnapshotKey>();
	for (const request of normalized) {
		if (request.from === target) continue;
		for (const baseCurrency of [request.from, target])
			keys.set(`${request.day}:${baseCurrency}`, { baseCurrency, date: request.day });
	}
	const rows = keys.size ? await read([...keys.values()]) : [];
	const snapshots = new Map(rows.map(row => [`${row.date}:${row.baseCurrency}`, row.rates]));
	const factors = new Map<string, number>();
	for (const request of normalized) {
		const key = `${request.source}:${request.date}`;
		if (request.from === target) {
			factors.set(key, 1);
			continue;
		}
		const source = snapshots.get(`${request.day}:${request.from}`);
		const destination = snapshots.get(`${request.day}:${target}`);
		const rate = source?.[target];
		if (destination && typeof rate === "number" && Number.isFinite(rate) && rate > 0)
			factors.set(key, rate);
	}
	return factors;
}
