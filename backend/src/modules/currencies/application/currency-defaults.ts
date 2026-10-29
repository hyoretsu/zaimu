import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { queryRaw } from "~/shared/infra/sql";
import { supportedCurrencies } from "./currency-catalog";

export async function assertSupportedCurrency(value: string): Promise<string> {
	const currency = value.trim().toUpperCase();
	if (!(await supportedCurrencies()).includes(currency))
		throw new HttpException("Moeda não suportada", 400);
	return currency;
}
/** Linked defaults never rewrite existing records; client supplies effective IP/device resolution. */
export async function defaultCurrency(userId: string, locationCurrency?: string | null): Promise<string> {
	const { value: preferredCurrency } = await distributedCache.remember(
		userId,
		"currencies:preferences",
		{},
		async () => {
			const [user] = await queryRaw<{ preferredCurrency: string | null }>(
				'SELECT "preferredCurrency" FROM "user" WHERE "id"=$1',
				[userId],
			);
			return user?.preferredCurrency ?? null;
		},
	);
	if (preferredCurrency) return preferredCurrency;
	return locationCurrency ? assertSupportedCurrency(locationCurrency) : "USD";
}
