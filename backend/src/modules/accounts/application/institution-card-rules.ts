import {
	cardRuleValues,
	defaultCardRules,
	type InstitutionCardRules,
} from "@zaimu/finance/institution-card-rules";
import { createEventEnvelope } from "~/shared/application/events";
import { HttpException } from "~/shared/errors";
import { PostgresOutbox } from "~/shared/infra/outbox";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { assertCashbackSettings } from "../domain/assert-cashback-settings";

/** Trusted SQL aliases only. Resolve profile for this user and financial date. */
export function institutionCardRulesSql(account = "a", date = "CURRENT_DATE") {
	return `COALESCE((SELECT p."creditCardRules" FROM "FinancialInstitutionProfile" p WHERE p."id"=COALESCE((SELECT h."profileId" FROM "UserInstitutionProfileChange" h JOIN "UserFinancialInstitution" l ON l.id=h."linkId" WHERE l."userId"=${account}."userId" AND l."institutionId"=${account}."institutionId" AND h."effectiveDate"<=${date} ORDER BY h."effectiveDate" DESC LIMIT 1),(SELECT d.id FROM "FinancialInstitutionProfile" d WHERE d."institutionId"=${account}."institutionId" AND d."isDefault" LIMIT 1))),(SELECT i."creditCardRules" FROM "FinancialInstitution" i WHERE i.id=${account}."institutionId"),'{}'::json)`;
}
export function workingDueDateSql(account = "a", date = "CURRENT_DATE") {
	return `COALESCE((${institutionCardRulesSql(account, date)}->>'workingDueDate')::boolean,false)`;
}
export async function accountCardRules(accountId: string, date = new Date().toISOString().slice(0, 10)) {
	const [row] = await queryRaw<{ rules: InstitutionCardRules }>(
		`SELECT ${institutionCardRulesSql("a", "$2::date")} AS rules FROM "FinancialAccount" a WHERE a.id=$1`,
		[accountId, date],
	);
	return row?.rules?.workingDueDate !== undefined ? row.rules : defaultCardRules;
}
export async function institutionCardRules(userId: string, institutionId: string | null | undefined) {
	if (!institutionId) return defaultCardRules;
	const [row] = await queryRaw<{ rules: InstitutionCardRules }>(
		`SELECT ${institutionCardRulesSql("a")} AS rules FROM (SELECT $1::varchar AS "userId",$2::varchar AS "institutionId") a`,
		[userId, institutionId],
	);
	return row?.rules?.workingDueDate !== undefined ? row.rules : defaultCardRules;
}
export async function configureInstitutionCardRules(
	institutionId: string,
	rules: InstitutionCardRules | null,
	profileId?: string,
) {
	if (rules?.cashback) {
		const reward = rules.cashback;
		assertCashbackSettings(cardRuleValues(rules));
		if ((reward.conversionPoints === null) !== (reward.conversionAmount === null))
			throw new HttpException("Informe pontos e valor da conversão juntos", 400);
		if (reward.kind === "CASHBACK" && reward.conversionPoints !== null)
			throw new HttpException("Conversão é exclusiva para pontos", 400);
	}
	return withRawTransaction(async query => {
		const [institution] = await query(`SELECT id FROM "FinancialInstitution" WHERE id=$1 FOR UPDATE`, [
			institutionId,
		]);
		if (!institution) throw new HttpException("Instituição não encontrada", 404);
		if (profileId) {
			const [profile] = await query(
				`UPDATE "FinancialInstitutionProfile" SET "creditCardRules"=$3::json,"updatedAt"=NOW() WHERE id=$1 AND "institutionId"=$2 RETURNING id`,
				[profileId, institutionId, rules === null ? null : JSON.stringify(rules)],
			);
			if (!profile) throw new HttpException("Perfil não encontrado", 404);
		} else
			await query(`UPDATE "FinancialInstitution" SET "creditCardRules"=$2::json WHERE id=$1`, [
				institutionId,
				JSON.stringify(rules ?? defaultCardRules),
			]);
		await query(`UPDATE "FinancialInstitution" SET version=version+1,"updatedAt"=NOW() WHERE id=$1`, [
			institutionId,
		]);
		const users = await query<{ userId: string }>(
			`SELECT DISTINCT "userId" FROM "FinancialAccount" WHERE "institutionId"=$1`,
			[institutionId],
		);
		await new PostgresOutbox().append(
			createEventEnvelope({
				aggregateId: institutionId,
				aggregateType: "account",
				correlationId: crypto.randomUUID(),
				eventType: "account.institution.reviewed",
				payload: { profileId, rulesUpdated: true },
				userIds: users.map(user => user.userId),
			}),
		);
		return { id: profileId ?? institutionId };
	});
}

/** Destination is internal bookkeeping, never a user-selectable benefit setting. */
export async function rewardAccountForRules(accountId: string, rules: InstitutionCardRules) {
	if (!rules.cashback) return null;
	const reward = rules.cashback;
	return withRawTransaction(async query => {
		const [source] = await query<{
			userId: string;
			institutionId: string | null;
			currency: string;
			countryCode: string | null;
		}>(`SELECT "userId","institutionId",currency,"countryCode" FROM "FinancialAccount" WHERE id=$1`, [
			accountId,
		]);
		if (!source) throw new HttpException("Conta não encontrada", 404);
		await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
			`card-rewards:${source.userId}:${source.institutionId}:${source.currency}:${reward.kind}`,
		]);
		const [existing] = await query<{ id: string }>(
			`SELECT a.id FROM "FinancialAccount" a JOIN "RewardsAccount" r ON r."financialAccountId"=a.id WHERE a."userId"=$1 AND a."institutionId" IS NOT DISTINCT FROM $2 AND a.currency=$3 AND a.name IS NULL AND r.kind=$4 AND r."conversionCurrency"=$3 AND r."conversionPoints" IS NOT DISTINCT FROM $5::numeric AND r."conversionAmount" IS NOT DISTINCT FROM $6::numeric ORDER BY a.id LIMIT 1`,
			[
				source.userId,
				source.institutionId,
				source.currency,
				reward.kind,
				reward.conversionPoints,
				reward.conversionAmount,
			],
		);
		if (existing) return existing.id;
		const id = crypto.randomUUID();
		await query(
			`INSERT INTO "FinancialAccount" (id,"userId","institutionId",name,type,currency,"countryCode","updatedAt") VALUES ($1,$2,$3,NULL,'REWARDS',$4,$5,NOW())`,
			[id, source.userId, source.institutionId, source.currency, source.countryCode],
		);
		await query(
			`INSERT INTO "RewardsAccount" (id,"financialAccountId",kind,"initialBalance","conversionPoints","conversionAmount","conversionCurrency","updatedAt") VALUES ($1,$2,$3,0,$4,$5,$6,NOW())`,
			[
				crypto.randomUUID(),
				id,
				reward.kind,
				reward.conversionPoints,
				reward.conversionAmount,
				source.currency,
			],
		);
		return id;
	});
}
export async function cardRulesForPurchase(cardId: string, userId: string, date: string) {
	const [card] = await queryRaw<{ financialAccountId: string }>(
		`SELECT c."financialAccountId" FROM "CreditCard" c JOIN "FinancialAccount" a ON a.id=c."financialAccountId" WHERE c.id=$1 AND a."userId"=$2`,
		[cardId, userId],
	);
	if (!card) throw new HttpException("Cartão não encontrado", 404);
	const rules = await accountCardRules(card.financialAccountId, date);
	return {
		...cardRuleValues(rules),
		cashbackAccountId: await rewardAccountForRules(card.financialAccountId, rules),
	};
}

export function cardRuleValuesSql(account = "account") {
	const rules = institutionCardRulesSql(account);
	return `jsonb_build_object('workingDueDate',${workingDueDateSql(account)},'cashbackRate',(${rules}#>>'{cashback,rate}')::numeric,'cashbackYieldPeriod',${rules}#>>'{cashback,yieldPeriod}','cashbackYieldReferenceRate',(${rules}#>>'{cashback,yieldReferenceRate}')::numeric,'cashbackYieldReferencePercentage',(${rules}#>>'{cashback,yieldReferencePercentage}')::numeric)`;
}

export async function cardRulesByAccount(accountIds: string[]) {
	if (!accountIds.length) return new Map<string, ReturnType<typeof cardRuleValues>>();
	const rows = await queryRaw<{ id: string; rules: InstitutionCardRules }>(
		`SELECT a.id,${institutionCardRulesSql()} AS rules FROM "FinancialAccount" a WHERE a.id=ANY($1)`,
		[accountIds],
	);
	return new Map(
		rows.map(row => [
			row.id,
			cardRuleValues(row.rules?.workingDueDate !== undefined ? row.rules : defaultCardRules),
		]),
	);
}
