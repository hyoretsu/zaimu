import { normalizeFinancialInstitutionName } from "~/modules/accounts/domain/normalize-financial-institution-name";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import { proposeInstitution, visibleInstitution } from "./universal-institutions";

export async function resolveFinancialInstitution(userId: string, input?: string | null, currency = "USD") {
	if (!input) return null;
	const { name, normalizedName } = normalizeFinancialInstitutionName(input);
	if (!name) return null;
	const matching = await queryRaw<{
		id: string;
		name: string;
		currency: string;
		creditStatementClosingInclusive: boolean;
		creditInstallmentRemainderOnFirst: boolean;
	}>(
		`SELECT "id","name","currency","creditInstallmentRemainderOnFirst","creditStatementClosingInclusive" FROM "FinancialInstitution" WHERE "normalizedName"=$1 AND ("status"='APPROVED' OR "userId"=$2) ORDER BY CASE WHEN "userId"=$2 THEN 0 ELSE 1 END`,
		[normalizedName, userId],
	);
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
