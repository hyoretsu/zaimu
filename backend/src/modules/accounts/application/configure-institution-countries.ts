import { assertSupportedCurrency } from "~/modules/currencies/application/currency-defaults";
import { supportedCountryCodes } from "~/modules/yield-calendar/calendar-source";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import type { InstitutionCatalogResult } from "../infra/dto/institution-catalog";

export async function configureInstitutionCountries(
	institutionId: string,
	accountCurrenciesByCountry: Record<string, string[]>,
	creditStatementClosingInclusive?: boolean,
): Promise<InstitutionCatalogResult> {
	for (const [countryCode, currencies] of Object.entries(accountCurrenciesByCountry)) {
		if (!supportedCountryCodes.includes(countryCode)) throw new HttpException("País não suportado", 400);
		if (!currencies.length) throw new HttpException("Selecione ao menos uma moeda por país", 400);
		for (const currency of currencies) await assertSupportedCurrency(currency);
	}
	const [institution] = await queryRaw<InstitutionCatalogResult>(
		`UPDATE "FinancialInstitution" SET "accountCurrenciesByCountry"=$2::jsonb,"operatingCountryCodes"=$3,"creditStatementClosingInclusive"=COALESCE($4,"creditStatementClosingInclusive"),"version"="version"+1,"updatedAt"=NOW() WHERE "id"=$1 RETURNING *`,
		[
			institutionId,
			JSON.stringify(accountCurrenciesByCountry),
			Object.keys(accountCurrenciesByCountry),
			creditStatementClosingInclusive ?? null,
		],
	);
	if (!institution) throw new HttpException("Instituição financeira não encontrada", 404);
	return institution;
}
