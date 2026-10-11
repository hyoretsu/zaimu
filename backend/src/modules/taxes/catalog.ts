import { setTaxDefinitions, type TaxBracket, type TaxDefinition } from "@zaimu/finance/yield-tax";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
export async function loadTaxCatalog(): Promise<TaxDefinition[]> {
	const rows = await queryRaw<{
		id: string;
		name: string;
		isActive: boolean;
		effectiveDate: Date;
		applicationOrder: number;
		brackets: TaxBracket[];
	}>(
		`SELECT d."id",d."name",d."isActive",v."effectiveDate",v."applicationOrder",v."brackets" FROM "TaxDefinition" d JOIN "TaxDefinitionVersion" v ON v."taxDefinitionId"=d."id" ORDER BY d."id",v."effectiveDate"`,
	);
	const definitions = [...Map.groupBy(rows, row => row.id)].map(([id, versions]) => ({
		id,
		isActive: versions[0]!.isActive,
		name: versions[0]!.name,
		versions: versions.map(version => ({
			applicationOrder: version.applicationOrder,
			brackets: version.brackets,
			effectiveDate: version.effectiveDate.toISOString().slice(0, 10),
		})),
	}));
	setTaxDefinitions(definitions);
	return definitions;
}
export async function assertTaxSelection(
	ids: string[] | null | undefined,
	existing: string[] = [],
	effectiveDate?: Date,
) {
	if (!ids?.length) return;
	const catalog = await loadTaxCatalog();
	if (
		new Set(ids).size !== ids.length ||
		ids.some(
			id =>
				!catalog.some(
					tax =>
						tax.id === id &&
						(tax.isActive || existing.includes(id)) &&
						(!effectiveDate ||
							tax.versions.some(
								version => version.effectiveDate <= effectiveDate.toISOString().slice(0, 10),
							)),
				),
		)
	)
		throw new HttpException("Selecione impostos disponíveis, sem duplicatas.", 400);
}
