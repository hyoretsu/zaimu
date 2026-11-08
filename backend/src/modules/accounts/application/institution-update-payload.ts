import { supportedCountryCodes } from "~/modules/yield-calendar/calendar-source";
import { HttpException } from "~/shared/errors";
import { normalizeFinancialInstitutionName } from "../domain/normalize-financial-institution-name";
import { assertInstitutionCardRules } from "./institution-card-rules";

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

interface ProposalProfile {
	creditCardRules?: Parameters<typeof assertInstitutionCardRules>[0];
	id?: string;
	name: string;
}
interface ProposalPolicy {
	profileId?: string;
	profileName?: string;
}

/** Validates the profile and policy sections of a composite proposal and trims profile names. */
function normalizeInstitutionSections(payload: Record<string, unknown>, next: Record<string, unknown>) {
	if (payload.creditCardRules !== undefined)
		assertInstitutionCardRules(
			payload.creditCardRules as Parameters<typeof assertInstitutionCardRules>[0],
		);
	if (payload.profiles !== undefined) {
		const seen = new Set<string>();
		next.profiles = (payload.profiles as ProposalProfile[]).map(profile => {
			const name = String(profile.name ?? "").trim();
			if (!name || name.length > 100)
				throw new HttpException("Informe um nome com até 100 caracteres", 400);
			if (!profile.id) {
				if (seen.has(name.toLowerCase()))
					throw new HttpException("Já existe um perfil com esse nome", 409);
				seen.add(name.toLowerCase());
			}
			if (profile.creditCardRules !== undefined) assertInstitutionCardRules(profile.creditCardRules);
			return { ...profile, name };
		});
	}
	if (payload.policies !== undefined)
		next.policies = (payload.policies as ProposalPolicy[]).map(policy => {
			if (!policy.profileId === !policy.profileName)
				throw new HttpException("Informe o perfil da política por id ou por nome", 400);
			return { ...policy, ...(policy.profileName ? { profileName: policy.profileName.trim() } : {}) };
		});
}

/** Validates and normalizes the fields of an `INSTITUTION_UPDATE`/`NEW_INSTITUTION` proposal; only changed fields are sent. */
export function normalizeInstitutionUpdatePayload(
	payload: Record<string, unknown>,
	options: { allowEmpty?: boolean } = {},
) {
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
	normalizeInstitutionSections(payload, next);
	if (!options.allowEmpty && !Object.keys(next).length)
		throw new HttpException("Nenhuma alteração informada", 400);
	return next;
}
