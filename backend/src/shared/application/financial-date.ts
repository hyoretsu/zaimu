import { financialDateKey, resolveTimeZone } from "@zaimu/finance/time-zone";
import { queryRaw } from "~/shared/infra/sql";

export function financialDate(now = new Date(), country?: string | null, preference?: string | null) {
	return financialDateKey(now, resolveTimeZone(preference, country));
}

export async function userFinancialDate(userId: string, now = new Date()) {
	const [user] = await queryRaw<{ preferredCountry: string | null; preferredTimeZone: string | null }>(
		'SELECT "preferredCountry","preferredTimeZone" FROM "user" WHERE "id"=$1',
		[userId],
	);
	return financialDate(now, user?.preferredCountry, user?.preferredTimeZone);
}
