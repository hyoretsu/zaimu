import { queryRaw } from "~/shared/infra/sql";
import { completedYieldDate } from "../domain/yield-scheduler-clock";
import { enqueueAccountYieldRecalculation } from "./reference-rate-jobs";

/** Replay from creation, including gaps older than the recent official-rate refresh window. */
export async function enqueueDailyAccountYieldRecalculations(now = new Date()) {
	const throughDate = completedYieldDate(now);
	const accounts = await queryRaw<{ id: string; createdAt: Date }>(
		`SELECT account."id", account."createdAt" FROM "FinancialAccount" account
		 WHERE account."type" <> 'CREDIT_CARD'
		 AND EXISTS (SELECT 1 FROM "FinancialAccountAsset" holding JOIN "Asset" asset ON asset."code"=holding."assetCode" AND asset."kind"='FIAT' WHERE holding."financialAccountId"=account."id" AND holding."assetCode"=account."yieldCurrency")
		 AND account."createdAt" < ($1::date + interval '1 day') AND (
		 account."yieldFixedRate" IS NOT NULL OR account."yieldReferenceType" IS NOT NULL
		 OR account."historicalYieldSettings" IS NOT NULL
		 OR account."transferredProfileContext" IS NOT NULL
		 OR EXISTS (SELECT 1 FROM "FinancialAccountYieldRateHistory" history WHERE history."financialAccountId"=account."id")
		 OR EXISTS (SELECT 1 FROM "FinancialInstitutionYieldPolicy" policy WHERE policy."financialInstitutionId" IN (account."institutionId", account."legacyInstitutionId")))`,
		[throughDate],
	);
	for (const account of accounts)
		await enqueueAccountYieldRecalculation(
			account.id,
			account.createdAt,
			`daily:${throughDate}`,
			throughDate,
		);
}
