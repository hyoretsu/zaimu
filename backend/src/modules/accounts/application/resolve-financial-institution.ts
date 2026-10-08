import { normalizeFinancialInstitutionName } from "~/modules/accounts/domain/normalize-financial-institution-name";
import { db, queryFirst } from "~/shared/infra/sql";

export async function resolveFinancialInstitution(userId: string, input?: string | null, currency = "USD") {
	if (!input) return null;
	const { name, normalizedName } = normalizeFinancialInstitutionName(input);
	if (!name) return null;

	const existing = await queryFirst(
		db.sql.public.FinancialInstitution.select("id", "name", "currency")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.userId, userId),
					functions.eq(fields.normalizedName, normalizedName),
				),
			)
			.limit(1)
			.build(),
	);
	if (existing) return existing;

	return queryFirst(
		db.sql.public.FinancialInstitution.insert([{ currency, name, normalizedName, userId }])
			.returning("id", "name", "currency")
			.build(),
	);
}
