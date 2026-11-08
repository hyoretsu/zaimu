import { supportedCountryCodes } from "~/modules/yield-calendar/calendar-source";
import { HttpException } from "~/shared/errors";
import { normalizeFinancialInstitutionName } from "../domain/normalize-financial-institution-name";

export function normalizeInstitutionAliases(aliases: string[], ownNormalizedName?: string) {
	const normalized = [
		...new Map(
			aliases
				.map(alias => normalizeFinancialInstitutionName(alias))
				.filter(alias => alias.name)
				.filter(alias => alias.normalizedName !== ownNormalizedName)
				.map(alias => [alias.normalizedName, alias.name] as const),
		).values(),
	];
	if (normalized.some(alias => alias.length > 100))
		throw new HttpException("Informe aliases com até 100 caracteres", 400);
	return normalized;
}

export function assertSupportedCountries(countryCodes: string[]) {
	for (const countryCode of countryCodes)
		if (!supportedCountryCodes.includes(countryCode)) throw new HttpException("País não suportado", 400);
}

/** Validates and normalizes the fields of an `INSTITUTION_UPDATE` proposal; only changed fields are sent. */
export function normalizeInstitutionUpdatePayload(payload: Record<string, unknown>) {
	const next: Record<string, unknown> = { ...payload };
	if (payload.name !== undefined) {
		const name = normalizeFinancialInstitutionName(String(payload.name));
		if (!name.name || name.name.length > 100)
			throw new HttpException("Informe um nome com até 100 caracteres", 400);
		next.name = name.name;
	}
	if (payload.aliases !== undefined)
		next.aliases = normalizeInstitutionAliases(
			payload.aliases as string[],
			next.name ? normalizeFinancialInstitutionName(String(next.name)).normalizedName : undefined,
		);
	if (payload.operatingCountryCodes !== undefined)
		assertSupportedCountries(payload.operatingCountryCodes as string[]);
	if (!Object.keys(next).length) throw new HttpException("Nenhuma alteração informada", 400);
	return next;
}
