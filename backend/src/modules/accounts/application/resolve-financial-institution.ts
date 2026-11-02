import { normalizeFinancialInstitutionName } from "~/modules/accounts/domain/normalize-financial-institution-name";
import { HttpException } from "~/shared/errors";
import { db, queryRows } from "~/shared/infra/sql";
import { proposeInstitution, visibleInstitution } from "./universal-institutions";

export async function resolveFinancialInstitution(userId: string, input?: string | null, currency = "USD") {
	if (!input) return null;
	const { name, normalizedName } = normalizeFinancialInstitutionName(input);
	if (!name) return null;
	const matching = await queryRows(
		db.sql.public.FinancialInstitution.select(
			"id",
			"name",
			"currency",
			"creditInstallmentRemainderOnFirst",
			"creditStatementClosingInclusive",
		)
			.where((f, fn) =>
				fn.and(
					fn.eq(f.normalizedName, normalizedName),
					fn.or(fn.eq(f.status, "APPROVED"), fn.eq(f.userId, userId)),
				),
			)
			.build(),
	);
	// Ordering is irrelevant: ambiguous homonyms are rejected rather than resolved by priority.
	// Names alone cannot identify universal homonyms safely.
	if (matching.length > 1)
		throw new HttpException(
			"Selecione a instituição pelo identificador; há instituições com o mesmo nome",
			409,
		);
	if (matching[0]) return matching[0];
	const proposal = await proposeInstitution(userId, null, "NEW_INSTITUTION", { currency, name });
	return visibleInstitution(userId, proposal.institutionId!);
}
