import Holidays from "date-holidays";
import { queryRaw } from "~/shared/infra/sql";

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Country preferences have no regional timezone yet. Use the country's primary zone. */
export function financialDate(now = new Date(), country = "BR") {
	let formatter = formatters.get(country);
	if (!formatter) {
		const timeZone = new Holidays(country).getTimezones()[0] ?? "America/Sao_Paulo";
		formatter = new Intl.DateTimeFormat("en-CA", {
			day: "2-digit",
			month: "2-digit",
			timeZone,
			year: "numeric",
		});
		formatters.set(country, formatter);
	}
	const parts = formatter.formatToParts(now);
	const part = (type: string) => parts.find(item => item.type === type)!.value;
	return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function userFinancialDate(userId: string, now = new Date()) {
	const [user] = await queryRaw<{ preferredCountry: string | null }>(
		'SELECT "preferredCountry" FROM "user" WHERE "id"=$1',
		[userId],
	);
	return financialDate(now, user?.preferredCountry ?? "BR");
}
