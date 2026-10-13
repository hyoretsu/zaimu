import { ensureCalendarCoverage, ensureCurrencyAssociations } from "./ensure-coverage";

interface Account {
	id: string;
	currency?: string | null;
	countryCode?: string | null;
}

/** Accounts share catalog/calendar coverage; never repeat that work per account. */
export async function ensureProjectedCoverage(
	accounts: Account[],
	years: number[],
	dependencies = {
		calendar: ensureCalendarCoverage,
		currency: ensureCurrencyAssociations,
	},
) {
	await Promise.all(
		[...new Set(accounts.map(account => account.currency ?? "BRL"))].map(dependencies.currency),
	);
	const countryCoverage = new Map(
		await Promise.all(
			[...new Set(accounts.flatMap(account => (account.countryCode ? [account.countryCode] : [])))].map(
				async country => {
					const statuses = await Promise.all(
						[...new Set(years)].map(year => dependencies.calendar(country, year)),
					);
					return [country, statuses.every(status => status === "COMPLETE")] as const;
				},
			),
		),
	);
	return new Map(
		accounts.map(account => [
			account.id,
			Boolean(account.countryCode && countryCoverage.get(account.countryCode)),
		]),
	);
}
