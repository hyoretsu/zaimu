import { assertSupportedCurrency } from "~/modules/currencies/application/currency-defaults";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { assertTaxSelection } from "~/modules/taxes/catalog";
import { createEventEnvelope } from "~/shared/application/events";
import { HttpException } from "~/shared/errors";
import { PostgresOutbox } from "~/shared/infra/outbox";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { assertFinancialInstitutionYieldPolicy } from "../domain/assert-financial-institution-yield-policy";
import { assertInstitutionReview } from "../domain/assert-institution-review";
import { normalizeFinancialInstitutionName } from "../domain/normalize-financial-institution-name";

export async function visibleInstitution(userId: string, id: string) {
	const [institution] = await queryRaw<{
		id: string;
		name: string;
		currency: string;
		creditStatementClosingInclusive: boolean;
		creditInstallmentRemainderOnFirst: boolean;
		status: string;
		version: number;
	}>(`SELECT * FROM "FinancialInstitution" WHERE "id"=$1 AND ("status"='APPROVED' OR "userId"=$2)`, [
		id,
		userId,
	]);
	if (!institution) throw new HttpException("Instituição financeira não encontrada", 404);
	return institution;
}

export async function proposeInstitution(
	userId: string,
	institutionId: string | null,
	kind: string,
	payload: Record<string, unknown>,
	effectiveDate?: string,
): Promise<{ id: string; institutionId: string; status: string }> {
	return withRawTransaction(async query => {
		let version: number | null = null;
		if (institutionId) {
			const original = await visibleInstitution(userId, institutionId);
			version = original.version;
			if (kind === "INSTITUTION_UPDATE" && original.status !== "APPROVED") {
				// Proposing publication of legacy identity never publishes its private policies.
				payload = {
					creditInstallmentRemainderOnFirst: original.creditInstallmentRemainderOnFirst,
					creditStatementClosingInclusive: original.creditStatementClosingInclusive,
					currency: original.currency,
					name: original.name,
					...payload,
				};
				return proposeInstitution(userId, null, "NEW_INSTITUTION", payload, effectiveDate);
			}
		} else {
			const normalized = normalizeFinancialInstitutionName(String(payload.name ?? ""));
			if (!normalized.name) throw new HttpException("Informe o nome da instituição", 400);
			institutionId = crypto.randomUUID();
			await query(
				`INSERT INTO "FinancialInstitution" ("id","userId","name","normalizedName","currency","status","operatingCountryCodes","updatedAt") VALUES ($1,$2,$3,$4,$5,'PENDING',$6,NOW())`,
				[
					institutionId,
					userId,
					normalized.name,
					normalized.normalizedName,
					payload.currency ?? "USD",
					payload.operatingCountryCodes ?? [],
				],
			);
			await query(
				`INSERT INTO "FinancialInstitutionProfile" ("id","institutionId","name","isDefault","updatedAt") VALUES ($1,$2,'Padrão',true,NOW())`,
				[crypto.randomUUID(), institutionId],
			);
		}
		const id = crypto.randomUUID();
		await query(
			`INSERT INTO "FinancialInstitutionProposal" ("id","institutionId","authorId","kind","baseVersion","payload","effectiveDate","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
			[id, institutionId, userId, kind, version, JSON.stringify(payload), effectiveDate ?? null],
		);
		if (kind === "NEW_INSTITUTION") {
			const [author] = await query<{ role: string }>(`SELECT "role" FROM "user" WHERE "id"=$1`, [userId]);
			if (author?.role === "ADMIN") {
				const result = await reviewInstitutionProposal(userId, id, "APPROVE");
				return { ...result, institutionId };
			}
		}
		await query(
			`INSERT INTO "AppNotification" ("id","userId","type","payload") SELECT gen_random_uuid()::text,"id",'INSTITUTION_REVIEW',$1::jsonb FROM "user" WHERE "role"='ADMIN'`,
			[JSON.stringify({ institutionId, proposalId: id })],
		);
		return { id, institutionId, status: "PENDING" };
	});
}

export async function reviewInstitutionProposal(
	reviewerId: string,
	id: string,
	action: "APPROVE" | "REJECT" | "ASSOCIATE",
	reason?: string,
	targetId?: string,
	confirmedVersion?: number,
	profileResolution?: { profileId: string; effectiveDate: string }[],
) {
	return withRawTransaction(async query => {
		const [proposal] = await query(`SELECT * FROM "FinancialInstitutionProposal" WHERE "id"=$1 FOR UPDATE`, [
			id,
		]);
		if (!proposal) throw new HttpException("Proposta não encontrada", 404);
		const [institution] = await query(`SELECT * FROM "FinancialInstitution" WHERE "id"=$1 FOR UPDATE`, [
			proposal.institutionId,
		]);
		if (!institution) throw new HttpException("Instituição não encontrada", 404);
		assertInstitutionReview({
			action,
			baseVersion: proposal.baseVersion,
			confirmedVersion,
			currentVersion: institution.version,
			reason,
			status: proposal.status,
		});
		const payload = proposal.payload as Record<string, unknown>;
		if (action === "ASSOCIATE") {
			if (institution.status === "APPROVED" || institution.userId !== proposal.authorId)
				throw new HttpException("Associação exige instituição privada do proponente", 400);
			if (!["NEW_INSTITUTION", "MERGE"].includes(proposal.kind) || !targetId || targetId === institution.id)
				throw new HttpException("Associação inválida", 400);
			const [target] = await query(
				`SELECT * FROM "FinancialInstitution" WHERE "id"=$1 AND "status"='APPROVED' FOR UPDATE`,
				[targetId],
			);
			if (!target) throw new HttpException("Instituição aprovada não encontrada", 404);
			// Never publish legacy rules, and reject conflicting profile histories.
			const histories = await query(
				`SELECT c.*,l."institutionId" FROM "UserInstitutionProfileChange" c JOIN "UserFinancialInstitution" l ON l."id"=c."linkId" WHERE l."userId"=$3 AND l."institutionId" IN ($1,$2) ORDER BY c."effectiveDate"`,
				[institution.id, targetId, proposal.authorId],
			);
			if (histories.length && !profileResolution)
				throw new HttpException("Resolva o histórico de perfis antes de associar", 409);
			const [targetLink] = await query(
				`INSERT INTO "UserFinancialInstitution" ("id","userId","institutionId","updatedAt") VALUES ($1,$2,$3,NOW()) ON CONFLICT ("userId","institutionId") DO UPDATE SET "updatedAt"=NOW() RETURNING "id"`,
				[crypto.randomUUID(), proposal.authorId, targetId],
			);
			if (profileResolution) {
				if (new Set(profileResolution.map(change => change.effectiveDate)).size !== profileResolution.length)
					throw new HttpException("Datas de perfil duplicadas", 400);
				for (const change of profileResolution) {
					const [profile] = await query(
						`SELECT "id" FROM "FinancialInstitutionProfile" WHERE "id"=$1 AND "institutionId"=$2`,
						[change.profileId, targetId],
					);
					if (!profile)
						throw new HttpException("Perfil da resolução não pertence à instituição de destino", 400);
				}
				await query(`DELETE FROM "UserInstitutionProfileChange" WHERE "linkId"=$1`, [targetLink.id]);
				for (const change of profileResolution)
					await query(
						`INSERT INTO "UserInstitutionProfileChange" ("id","linkId","profileId","effectiveDate","updatedAt") VALUES ($1,$2,$3,$4,NOW())`,
						[crypto.randomUUID(), targetLink.id, change.profileId, change.effectiveDate],
					);
			}
			payload.previousProfileHistory = histories;
			await query(
				`UPDATE "FinancialAccount" SET "legacyInstitutionId"=COALESCE("legacyInstitutionId","institutionId"),"institutionId"=$2,"updatedAt"=NOW() WHERE "institutionId"=$1 AND "userId"=$3`,
				[institution.id, targetId, proposal.authorId],
			);
			await query(
				`UPDATE "FinancialInstitution" SET "status"='LEGACY_PRIVATE',"updatedAt"=NOW() WHERE "id"=$1`,
				[institution.id],
			);
			await query(
				`UPDATE "FinancialInstitutionProposal" SET "status"='SUPERSEDED',"reason"='Instituição associada a registro aprovado',"updatedAt"=NOW() WHERE "institutionId"=$1 AND "status"='PENDING' AND "id"<>$2`,
				[institution.id, id],
			);
		} else if (action === "APPROVE") {
			if (proposal.kind === "NEW_INSTITUTION" || proposal.kind === "INSTITUTION_UPDATE") {
				const name = normalizeFinancialInstitutionName(String(payload.name ?? institution.name));
				await query(
					`UPDATE "FinancialInstitution" SET "name"=$2,"normalizedName"=$3,"currency"=$4,"creditInstallmentRemainderOnFirst"=$5,"operatingCountryCodes"=$6,"creditStatementClosingInclusive"=$7,"status"='APPROVED',"userId"=NULL,"version"="version"+1,"updatedAt"=NOW() WHERE "id"=$1`,
					[
						institution.id,
						name.name,
						name.normalizedName,
						payload.currency ?? institution.currency,
						payload.creditInstallmentRemainderOnFirst ?? institution.creditInstallmentRemainderOnFirst,
						payload.operatingCountryCodes ?? institution.operatingCountryCodes,
						payload.creditStatementClosingInclusive ?? institution.creditStatementClosingInclusive,
					],
				);
			} else if (proposal.kind === "PROFILE") {
				await query(
					`INSERT INTO "FinancialInstitutionProfile" ("id","institutionId","name","isDefault","updatedAt") VALUES ($1,$2,$3,false,NOW())`,
					[crypto.randomUUID(), institution.id, payload.name],
				);
				await query(`UPDATE "FinancialInstitution" SET "version"="version"+1 WHERE "id"=$1`, [
					institution.id,
				]);
			} else if (proposal.kind === "POLICY") {
				if (!proposal.effectiveDate) throw new HttpException("Informe a vigência", 400);
				const policy = payload as unknown as Parameters<typeof assertFinancialInstitutionYieldPolicy>[0] & {
					profileId: string;
					countryCode?: string;
					effectiveUntil?: string;
				};
				if (
					policy.effectiveUntil &&
					policy.effectiveUntil <= new Date(proposal.effectiveDate).toISOString().slice(0, 10)
				)
					throw new HttpException("Fim da vigência deve ser posterior ao início", 400);
				policy.currency = await assertSupportedCurrency(policy.currency ?? institution.currency);
				assertFinancialInstitutionYieldPolicy(policy);
				await assertTaxSelection(policy.yieldTaxIds, [], new Date(proposal.effectiveDate));
				const [profile] = await query(
					`SELECT "id" FROM "FinancialInstitutionProfile" WHERE "id"=$1 AND "institutionId"=$2`,
					[policy.profileId, institution.id],
				);
				if (!profile) throw new HttpException("Perfil não encontrado", 400);
				const [existing] = await query(
					`SELECT "id" FROM "FinancialInstitutionYieldPolicy" WHERE "financialInstitutionId"=$1 AND "profileId"=$2 AND "currency"=$3 AND "countryCode" IS NOT DISTINCT FROM $4 AND "effectiveDate"=$5 FOR UPDATE`,
					[
						institution.id,
						policy.profileId,
						policy.currency,
						policy.countryCode ?? null,
						proposal.effectiveDate,
					],
				);
				const policyId = existing?.id ?? crypto.randomUUID();
				if (existing) {
					await query(`DELETE FROM "FinancialInstitutionYieldRule" WHERE "financialYieldPolicyId"=$1`, [
						policyId,
					]);
					await query(
						`UPDATE "FinancialInstitutionYieldPolicy" SET "yieldPeriod"=$2,"yieldTaxIds"=$3,"yieldTaxRate"=$4,"effectiveUntil"=$5,"updatedAt"=NOW() WHERE "id"=$1`,
						[
							policyId,
							policy.yieldPeriod ?? null,
							policy.yieldTaxIds ?? [],
							policy.yieldTaxRate ?? null,
							policy.effectiveUntil ?? null,
						],
					);
				} else
					await query(
						`INSERT INTO "FinancialInstitutionYieldPolicy" ("id","financialInstitutionId","profileId","countryCode","currency","effectiveDate","effectiveUntil","yieldPeriod","yieldTaxIds","yieldTaxRate","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
						[
							policyId,
							institution.id,
							policy.profileId,
							policy.countryCode ?? null,
							policy.currency,
							proposal.effectiveDate,
							policy.effectiveUntil ?? null,
							policy.yieldPeriod ?? null,
							policy.yieldTaxIds ?? [],
							policy.yieldTaxRate ?? null,
						],
					);
				for (const [position, rule] of policy.rules.entries())
					await query(
						`INSERT INTO "FinancialInstitutionYieldRule" ("id","financialYieldPolicyId","position","upToBalance","yieldFixedRate","yieldReferencePercentage","yieldReferenceType") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
						[
							crypto.randomUUID(),
							policyId,
							position,
							rule.upToBalance ?? null,
							rule.yieldFixedRate ?? null,
							rule.yieldReferencePercentage ?? null,
							rule.yieldReferenceType ?? null,
						],
					);
				await query(`UPDATE "FinancialInstitution" SET "version"="version"+1 WHERE "id"=$1`, [
					institution.id,
				]);
			} else throw new HttpException("Tipo de proposta não suportado", 400);
		} else if (proposal.kind === "NEW_INSTITUTION")
			await query(`UPDATE "FinancialInstitution" SET "status"='REJECTED_PRIVATE' WHERE "id"=$1`, [
				institution.id,
			]);
		const status = action === "REJECT" ? "REJECTED" : action === "ASSOCIATE" ? "ASSOCIATED" : "APPROVED";
		await query(
			`UPDATE "FinancialInstitutionProposal" SET "status"=$2,"reviewerId"=$3,"reason"=$4,"reviewedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$1`,
			[id, status, reviewerId, reason ?? null],
		);
		const [after] = await query(`SELECT * FROM "FinancialInstitution" WHERE "id"=$1`, [institution.id]);
		await query(
			`INSERT INTO "InstitutionReviewAudit" ("id","proposalId","reviewerId","action","payload") VALUES ($1,$2,$3,$4,$5)`,
			[
				crypto.randomUUID(),
				id,
				reviewerId,
				action,
				JSON.stringify({
					after,
					before: institution,
					confirmedVersion,
					profileResolution,
					proposal: payload,
					reason,
					targetId,
				}),
			],
		);
		await query(
			`INSERT INTO "AppNotification" ("id","userId","type","payload") VALUES ($1,$2,'INSTITUTION_REVIEW_RESULT',$3)`,
			[crypto.randomUUID(), proposal.authorId, JSON.stringify({ proposalId: id, reason, status, targetId })],
		);
		if (action !== "REJECT" && proposal.effectiveDate) {
			const accounts = await query<{ id: string }>(
				`SELECT "id" FROM "FinancialAccount" WHERE "institutionId"=$1`,
				[institution.id],
			);
			for (const account of accounts)
				await enqueueAccountYieldRecalculation(
					account.id,
					new Date(proposal.effectiveDate),
					`institution-review:${id}`,
				);
		}
		const users = await query<{ userId: string }>(
			`SELECT DISTINCT "userId" FROM "FinancialAccount" WHERE "institutionId"=$1`,
			[action === "ASSOCIATE" ? targetId : institution.id],
		);
		await new PostgresOutbox().append(
			createEventEnvelope({
				aggregateId: institution.id,
				aggregateType: "account",
				correlationId: id,
				eventType: "account.institution.reviewed",
				payload: { proposalId: id, status },
				userIds: users.map(row => row.userId),
			}),
		);
		return { id, status };
	});
}

export async function ensureInstitutionLink(
	userId: string,
	institutionId: string,
	effectiveDate = new Date(),
) {
	await queryRaw(
		`INSERT INTO "UserFinancialInstitution" ("id","userId","institutionId","globalRulesFrom","updatedAt") SELECT $1,$2::varchar,"id",CASE WHEN "status"='APPROVED' THEN $4::date ELSE NULL END,NOW() FROM "FinancialInstitution" WHERE "id"=$3 AND ("status"='APPROVED' OR "userId"=$2) ON CONFLICT ("userId","institutionId") DO NOTHING`,
		[crypto.randomUUID(), userId, institutionId, effectiveDate],
	);
}
