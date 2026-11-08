import { countryCurrency } from "@zaimu/finance/currency-preference";
import { supportedCurrencies } from "~/modules/currencies/application/currency-catalog";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import { normalizeFinancialInstitutionName } from "../domain/normalize-financial-institution-name";
import type { InstitutionCatalogResult } from "../infra/dto/institution-catalog";
import { assertSupportedCountries, normalizeInstitutionAliases } from "./institution-update-payload";

export async function configureInstitutionCountries(
	institutionId: string,
	operatingCountryCodes: string[],
	creditStatementClosingInclusive?: boolean,
	name?: string,
	aliases?: string[],
): Promise<InstitutionCatalogResult> {
	const normalized = name === undefined ? undefined : normalizeFinancialInstitutionName(name);
	if (normalized && (!normalized.name || normalized.name.length > 100))
		throw new HttpException("Informe um nome com até 100 caracteres", 400);
	const normalizedAliases =
		aliases === undefined ? undefined : normalizeInstitutionAliases(aliases, normalized?.normalizedName);
	assertSupportedCountries(operatingCountryCodes);
	const currencies = await supportedCurrencies();
	const currency =
		operatingCountryCodes.length === 1 ? countryCurrency(operatingCountryCodes[0]!, currencies) : null;
	const [institution] = await queryRaw<InstitutionCatalogResult>(
		`UPDATE "FinancialInstitution" SET "accountCurrenciesByCountry"='{}'::json,"operatingCountryCodes"=$3,"currency"=COALESCE($2,"currency"),"creditStatementClosingInclusive"=COALESCE($4,"creditStatementClosingInclusive"),"name"=COALESCE($5,"name"),"normalizedName"=COALESCE($6,"normalizedName"),"aliases"=COALESCE($7::varchar[],"aliases"),"version"="version"+1,"updatedAt"=NOW() WHERE "id"=$1 RETURNING *`,
		[
			institutionId,
			currency,
			operatingCountryCodes,
			creditStatementClosingInclusive ?? null,
			normalized?.name ?? null,
			normalized?.normalizedName ?? null,
			normalizedAliases ?? null,
		],
	);
	if (!institution) throw new HttpException("Instituição financeira não encontrada", 404);
	return institution;
}
