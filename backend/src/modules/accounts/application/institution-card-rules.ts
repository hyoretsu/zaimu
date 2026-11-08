import {
	cardRuleValues,
	defaultCardRules,
	type InstitutionCardRules,
} from "@zaimu/finance/institution-card-rules";
import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { assertCashbackSettings } from "../domain/assert-cashback-settings";
import { ensureAccountAssetCatalog } from "./account-assets";

/** Trusted SQL aliases only. Resolve profile for this user and financial date. */
export function institutionCardRulesSql(account = "a", date = "CURRENT_DATE") {
	const context = `(to_jsonb(${account})->'transferredProfileContext')`;
	const archivedProfile = `COALESCE((SELECT change->>'profileId' FROM jsonb_array_elements(COALESCE(${context}->'institutionProfileChanges','[]'::jsonb)) change WHERE (change->>'effectiveDate')::date<=${date} ORDER BY change->>'effectiveDate' DESC LIMIT 1),${context}->>'defaultInstitutionProfileId')`;
	const live = `COALESCE((SELECT p."creditCardRules" FROM "FinancialInstitutionProfile" p WHERE p."id"=COALESCE((SELECT change->>'profileId' FROM jsonb_array_elements(COALESCE(to_jsonb(${account})->'transferredProfileContext'->'institutionProfileChanges','[]'::jsonb)) change WHERE (change->>'effectiveDate')::date<=${date} ORDER BY change->>'effectiveDate' DESC LIMIT 1),(to_jsonb(${account})->'transferredProfileContext'->>'defaultInstitutionProfileId'),(SELECT h."profileId" FROM "UserInstitutionProfileChange" h JOIN "UserFinancialInstitution" l ON l.id=h."linkId" WHERE l."userId"=${account}."userId" AND l."institutionId"=${account}."institutionId" AND h."effectiveDate"<=${date} ORDER BY h."effectiveDate" DESC LIMIT 1),(SELECT d.id FROM "FinancialInstitutionProfile" d WHERE d."institutionId"=${account}."institutionId" AND d."isDefault" LIMIT 1))),(SELECT i."creditCardRules" FROM "FinancialInstitution" i WHERE i.id=${account}."institutionId"),'{}'::json)`;
	return `COALESCE((SELECT nullif(profile->'creditCardRules','null'::jsonb) FROM jsonb_array_elements(COALESCE(${context}->'cardRulesProfiles','[]'::jsonb)) profile WHERE profile->>'id'=${archivedProfile}),(${live})::jsonb)`;
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
export function assertInstitutionCardRules(rules: InstitutionCardRules | null) {
	if (!rules?.cashback) return;
	const reward = rules.cashback;
	assertCashbackSettings(cardRuleValues(rules));
	if ((reward.conversionPoints === null) !== (reward.conversionAmount === null))
		throw new HttpException("Informe pontos e valor da conversão juntos", 400);
	if (reward.kind === "CASHBACK" && reward.conversionPoints !== null)
		throw new HttpException("Conversão é exclusiva para pontos", 400);
}

export type RawQuery = Parameters<Parameters<typeof withRawTransaction>[0]>[0];

/** Writes rules inside the caller's transaction; the caller owns the institution lock and events. */
export async function writeInstitutionCardRules(
	query: RawQuery,
	institutionId: string,
	rules: InstitutionCardRules | null,
	profileId?: string,
	bumpVersion = true,
) {
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
	if (bumpVersion)
		await query(`UPDATE "FinancialInstitution" SET version=version+1,"updatedAt"=NOW() WHERE id=$1`, [
			institutionId,
		]);
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
		}>(
			`SELECT a."userId",a."institutionId",c.currency,a."countryCode" FROM "FinancialAccount" a JOIN "CreditCard" c ON c."financialAccountId"=a.id WHERE a.id=$1`,
			[accountId],
		);
		if (!source) throw new HttpException("Conta não encontrada", 404);
		const assetCode = reward.assetCode ?? source.currency;
		await ensureAccountAssetCatalog(assetCode);
		const [asset] = await query<{ code: string }>(`SELECT code FROM "Asset" WHERE code=$1`, [assetCode]);
		if (!asset) throw new HttpException("Ativo de recompensa indisponível", 400);
		await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
			`card-rewards:${source.userId}:${source.institutionId}:${assetCode}:${reward.kind}`,
		]);
		const [existing] = await query<{ id: string }>(
			`SELECT a.id FROM "FinancialAccount" a JOIN "RewardsAccount" r ON r."financialAccountId"=a.id WHERE a."userId"=$1 AND a."institutionId" IS NOT DISTINCT FROM $2 AND r."assetCode"=$3 AND a.name IS NULL AND r.kind=$4 AND r."conversionCurrency"=$7 AND r."conversionPoints" IS NOT DISTINCT FROM $5::numeric AND r."conversionAmount" IS NOT DISTINCT FROM $6::numeric ORDER BY a.id LIMIT 1`,
			[
				source.userId,
				source.institutionId,
				assetCode,
				reward.kind,
				reward.conversionPoints,
				reward.conversionAmount,
				source.currency,
			],
		);
		if (existing) return existing.id;
		const id = crypto.randomUUID();
		await query(
			`INSERT INTO "FinancialAccount" (id,"userId","institutionId",name,type,"countryCode","updatedAt") VALUES ($1,$2,$3,NULL,'REWARDS',$4,NOW())`,
			[id, source.userId, source.institutionId, source.countryCode],
		);
		await query(
			`INSERT INTO "FinancialAccountAsset" ("financialAccountId","assetCode",balance) VALUES ($1,$2,0) ON CONFLICT DO NOTHING`,
			[id, assetCode],
		);
		await query(
			`INSERT INTO "RewardsAccount" (id,"financialAccountId",kind,"initialBalance","conversionPoints","conversionAmount","conversionCurrency","assetCode","updatedAt") VALUES ($1,$2,$3,0,$4,$5,$7,$6,NOW())`,
			[
				crypto.randomUUID(),
				id,
				reward.kind,
				reward.conversionPoints,
				reward.conversionAmount,
				assetCode,
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
	// Resolve the profile once: repeating this expression inflates PostgreSQL JIT compilation.
	const rules = institutionCardRulesSql(account);
	return `(WITH resolved_card_rules AS MATERIALIZED (SELECT ${rules} AS value)
 SELECT jsonb_build_object('workingDueDate',COALESCE((value->>'workingDueDate')::boolean,false),'cashbackRate',(value#>>'{cashback,rate}')::numeric,'cashbackYieldPeriod',value#>>'{cashback,yieldPeriod}','cashbackYieldReferenceRate',(value#>>'{cashback,yieldReferenceRate}')::numeric,'cashbackYieldReferencePercentage',(value#>>'{cashback,yieldReferencePercentage}')::numeric)
 FROM resolved_card_rules)`;
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
