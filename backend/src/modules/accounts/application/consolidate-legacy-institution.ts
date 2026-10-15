import { createEventEnvelope } from "~/shared/application/events";
import { HttpException } from "~/shared/errors";
import { PostgresOutbox } from "~/shared/infra/outbox";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import type { InstitutionCatalogResult } from "../infra/dto/institution-catalog";

/** Publish identity only. Private yield policies and profile history remain on the legacy source. */
export async function consolidateLegacyInstitution(reviewerId: string, sourceId: string, targetId?: string) {
	return withRawTransaction(async query => {
		const [source] = await query(`SELECT * FROM "FinancialInstitution" WHERE "id"=$1 FOR UPDATE`, [sourceId]);
		if (source?.status !== "LEGACY_PRIVATE" || !source.userId)
			throw new HttpException("Selecione uma instituição antiga ainda não consolidada", 409);
		const accounts = await query<{ id: string; userId: string }>(
			`SELECT "id","userId" FROM "FinancialAccount" WHERE "institutionId"=$1 FOR UPDATE`,
			[sourceId],
		);

		// Serialize publication of the same normalized identity. Equal names require explicit association.
		await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
			`institution-publication:${source.normalizedName}`,
		]);
		if (!targetId) {
			const existing = await query(
				`SELECT "id" FROM "FinancialInstitution" WHERE "normalizedName"=$1 AND "status"='APPROVED'`,
				[source.normalizedName],
			);
			if (existing.length)
				throw new HttpException(
					"Já existe instituição global com esse nome. Selecione o destino para associar",
					409,
				);
			targetId = crypto.randomUUID();
			await query(
				`INSERT INTO "FinancialInstitution" ("id","name","normalizedName","currency","creditInstallmentRemainderOnFirst","operatingCountryCodes","creditStatementClosingInclusive","status","version","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,'APPROVED',1,NOW())`,
				[
					targetId,
					source.name,
					source.normalizedName,
					source.currency,
					source.creditInstallmentRemainderOnFirst,
					source.operatingCountryCodes,
					source.creditStatementClosingInclusive,
				],
			);
			await query(
				`INSERT INTO "FinancialInstitutionProfile" ("id","institutionId","name","isDefault","updatedAt") VALUES ($1,$2,'Padrão',true,NOW())`,
				[crypto.randomUUID(), targetId],
			);
		} else {
			const [target] = await query(
				`SELECT "id" FROM "FinancialInstitution" WHERE "id"=$1 AND "status"='APPROVED' FOR UPDATE`,
				[targetId],
			);
			if (!target) throw new HttpException("Instituição global não encontrada", 404);
		}
		const users = [...new Set([source.userId as string, ...accounts.map(account => account.userId)])];
		for (const userId of users) {
			// No adoption date: historical legacy rules remain until the user explicitly selects global rules.
			await query(
				`INSERT INTO "UserFinancialInstitution" ("id","userId","institutionId","updatedAt") VALUES ($1,$2,$3,NOW()) ON CONFLICT ("userId","institutionId") DO NOTHING`,
				[crypto.randomUUID(), userId, targetId],
			);
		}
		await query(
			`UPDATE "FinancialAccount" SET "legacyInstitutionId"=COALESCE("legacyInstitutionId","institutionId"),"institutionId"=$2,"updatedAt"=NOW() WHERE "institutionId"=$1`,
			[sourceId, targetId],
		);
		// Archive identity under no owner so old clients also stop offering the private duplicate.
		await query(`UPDATE "FinancialInstitution" SET "userId"=NULL,"updatedAt"=NOW() WHERE "id"=$1`, [
			sourceId,
		]);
		const proposalId = crypto.randomUUID();
		const [proposal] = await query(
			`INSERT INTO "FinancialInstitutionProposal" ("id","institutionId","authorId","kind","baseVersion","payload","status","reviewerId","reviewedAt","updatedAt") VALUES ($1,$2,$3,'MERGE',$4,$5,'ASSOCIATED',$6,NOW(),NOW()) RETURNING *`,
			[
				proposalId,
				sourceId,
				source.userId,
				source.version,
				JSON.stringify({ legacyConsolidation: true, targetId }),
				reviewerId,
			],
		);
		const pending = await query(
			`SELECT * FROM "FinancialInstitutionProposal" WHERE "institutionId"=$1 AND "status"='PENDING' FOR UPDATE`,
			[sourceId],
		);
		for (const item of pending) {
			if (["NEW_INSTITUTION", "MERGE"].includes(item.kind)) {
				await query(
					`UPDATE "FinancialInstitutionProposal" SET "status"='SUPERSEDED',"reason"='Instituição antiga consolidada no catálogo global',"updatedAt"=NOW() WHERE "id"=$1`,
					[item.id],
				);
				continue;
			}
			const payload = { ...item.payload };
			if (item.kind === "POLICY") {
				const [profile] = await query(
					`SELECT target."id" FROM "FinancialInstitutionProfile" source JOIN "FinancialInstitutionProfile" target ON target."institutionId"=$2 AND (target."isDefault" AND source."isDefault" OR NOT source."isDefault" AND target."name"=source."name") WHERE source."id"=$1 AND source."institutionId"=$3`,
					[payload.profileId, targetId, sourceId],
				);
				if (!profile)
					throw new HttpException("Revise o perfil da política pendente antes de consolidar", 409);
				payload.profileId = profile.id;
			}
			await query(
				`UPDATE "FinancialInstitutionProposal" SET "institutionId"=$2::varchar(36),"baseVersion"=(SELECT "version" FROM "FinancialInstitution" WHERE "id"=$2::varchar(36)),"payload"=$3,"updatedAt"=NOW() WHERE "id"=$1`,
				[item.id, targetId, JSON.stringify(payload)],
			);
		}
		await query(
			`INSERT INTO "InstitutionReviewAudit" ("id","proposalId","reviewerId","action","payload") VALUES ($1,$2,$3,'ASSOCIATE',$4)`,
			[
				crypto.randomUUID(),
				proposalId,
				reviewerId,
				JSON.stringify({
					accountIds: accounts.map(account => account.id),
					before: source,
					pendingBefore: pending,
					proposal,
					targetId,
				}),
			],
		);
		for (const userId of users)
			await query(
				`INSERT INTO "AppNotification" ("id","userId","type","payload") VALUES ($1,$2,'INSTITUTION_REVIEW_RESULT',$3)`,
				[crypto.randomUUID(), userId, JSON.stringify({ proposalId, status: "ASSOCIATED", targetId })],
			);
		await new PostgresOutbox().append(
			createEventEnvelope({
				aggregateId: targetId,
				aggregateType: "account",
				correlationId: proposalId,
				eventType: "account.institution.reviewed",
				payload: { proposalId, status: "ASSOCIATED" },
				userIds: users,
			}),
		);
		return { accounts: accounts.length, institutionId: targetId, sourceId };
	});
}

/** Archived private sources stay for history, never as duplicate selectable institutions. */
export async function listInstitutionCatalog(userId: string, admin = false) {
	return queryRaw<InstitutionCatalogResult>(
		`SELECT i.* FROM "FinancialInstitution" i WHERE i."status"='APPROVED' OR ((i."userId"=$1 OR $2::boolean) AND (i."status"<>'LEGACY_PRIVATE' OR i."userId" IS NOT NULL)) ORDER BY i."name",i."id"`,
		[userId, admin],
	);
}
