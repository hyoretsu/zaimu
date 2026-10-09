import type { DebtSplitInput } from "~/modules/debts/domain";
import { calculateDebtSplit, DebtSplitValidationError } from "~/modules/debts/domain";
import { HttpException } from "~/shared/errors";
import { db, queryFirst, queryRaw, queryRows, withRawTransaction } from "~/shared/infra/sql";
import type { DebtSplitReturnDTO } from "../infra/elysia/DebtSplitsDTO";

export type DebtSplitTarget =
	| { creditCardImportItemId: string }
	| { creditPurchaseId: string }
	| { recurrenceId: string }
	| { transactionImportItemId: string }
	| { transactionId: string };

export type DebtSplitTargetField =
	| "creditCardImportItemId"
	| "creditPurchaseId"
	| "recurrenceId"
	| "transactionImportItemId"
	| "transactionId";
const targetEntry = (target: DebtSplitTarget) => Object.entries(target)[0] as [DebtSplitTargetField, string];

export type DebtSplitReturn = typeof DebtSplitReturnDTO.static;

export function calculateDebtSplitOrThrow(amount: number, split: DebtSplitInput, currency = "BRL") {
	try {
		return calculateDebtSplit(amount, split, currency);
	} catch (error) {
		if (error instanceof DebtSplitValidationError) throw new HttpException(error.message, 400);
		throw error;
	}
}

async function assertParticipantsOwned(split: DebtSplitInput, userId: string) {
	const ids = split.participants.map(participant => participant.debtPersonId);
	const people = await queryRows(
		db.sql.public.DebtPerson.select("id")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.userId, userId),
					functions.in(fields.id, ids),
					functions.eq(fields.hiddenAt, null),
				),
			)
			.build(),
	);
	if (people.length !== new Set(ids).size)
		throw new HttpException("Uma ou mais pessoas do rateio estão indisponíveis", 404);
}

async function findSplit(target: DebtSplitTarget) {
	const [field, id] = targetEntry(target);
	return queryFirst(
		db.sql.public.DebtSplit.select(
			"id",
			"mode",
			"ownerIncluded",
			"ownerShares",
			"remainderDebtPersonId",
			"userId",
			"creditCardImportItemId",
			"transactionId",
			"transactionImportItemId",
			"creditPurchaseId",
			"recurrenceId",
		)
			.where((fields, functions) => {
				if (field === "creditCardImportItemId") return functions.eq(fields.creditCardImportItemId, id);
				if (field === "creditPurchaseId") return functions.eq(fields.creditPurchaseId, id);
				if (field === "recurrenceId") return functions.eq(fields.recurrenceId, id);
				if (field === "transactionImportItemId") return functions.eq(fields.transactionImportItemId, id);
				return functions.eq(fields.transactionId, id);
			})
			.limit(1)
			.build(),
	);
}

/** One query for every purchase rule, including ordered participants. No per-purchase lookup. */
export async function getDebtSplitInputs(
	field: DebtSplitTargetField,
	ids: string[],
): Promise<Map<string, DebtSplitInput>> {
	if (ids.length === 0) return new Map();
	const columns: Record<DebtSplitTargetField, string> = {
		creditCardImportItemId: "creditCardImportItemId",
		creditPurchaseId: "creditPurchaseId",
		recurrenceId: "recurrenceId",
		transactionId: "transactionId",
		transactionImportItemId: "transactionImportItemId",
	};
	const column = columns[field];
	const rows = await queryRaw<{
		targetId: string;
		mode: "SHARES" | "PERCENTAGE" | "FIXED";
		ownerIncluded: boolean;
		ownerShares: number | null;
		remainderDebtPersonId: string | null;
		participants: {
			debtPersonId: string;
			description: string | null;
			shares: number | null;
			percentage: number | null;
			fixedAmount: number | null;
		}[];
	}>(
		`SELECT s."${column}" AS "targetId", s."mode", s."ownerIncluded", s."ownerShares", s."remainderDebtPersonId",
  COALESCE(json_agg(json_build_object('debtPersonId',p."debtPersonId",'description',p."description",'shares',p."shares",'percentage',p."percentage",'fixedAmount',p."fixedAmount") ORDER BY p."sortOrder",p."id") FILTER (WHERE p."id" IS NOT NULL),'[]') AS "participants"
  FROM "DebtSplit" s LEFT JOIN "DebtSplitParticipant" p ON p."debtSplitId"=s."id"
  WHERE s."${column}"=ANY($1::varchar[]) GROUP BY s."id"`,
		[[...new Set(ids)]],
	);
	return new Map(
		rows.map(split => {
			let input: DebtSplitInput;
			const common = {
				ownerIncluded: split.ownerIncluded,
				remainderDebtPersonId: split.remainderDebtPersonId ?? undefined,
			};
			if (split.mode === "SHARES")
				input = {
					mode: "SHARES",
					ownerShares: split.ownerIncluded ? (split.ownerShares ?? 1) : null,
					participants: split.participants.map(p => ({
						debtPersonId: p.debtPersonId,
						description: p.description ?? undefined,
						shares: p.shares ?? 1,
					})),
				};
			else if (split.mode === "PERCENTAGE")
				input = {
					...common,
					mode: "PERCENTAGE",
					participants: split.participants.map(p => ({
						debtPersonId: p.debtPersonId,
						description: p.description ?? undefined,
						percentage: Number(p.percentage),
					})),
				};
			else
				input = {
					...common,
					mode: "FIXED",
					participants: split.participants.map(p => ({
						debtPersonId: p.debtPersonId,
						description: p.description ?? undefined,
						fixedAmount: Number(p.fixedAmount),
					})),
				};
			return [split.targetId, input];
		}),
	);
}

export async function getDebtSplitInput(target: DebtSplitTarget): Promise<DebtSplitInput | undefined> {
	const split = await findSplit(target);
	if (!split) return;
	const participants = await queryRows(
		db.sql.public.DebtSplitParticipant.select(
			"debtPersonId",
			"description",
			"shares",
			"percentage",
			"fixedAmount",
			"sortOrder",
		)
			.where((fields, functions) => functions.eq(fields.debtSplitId, split.id))
			.orderBy("sortOrder", { direction: "asc" })
			.build(),
	);
	if (split.mode === "SHARES") {
		return {
			mode: "SHARES",
			ownerShares: split.ownerIncluded ? (split.ownerShares ?? 1) : null,
			participants: participants.map(participant => ({
				debtPersonId: participant.debtPersonId,
				description: participant.description ?? undefined,
				shares: participant.shares ?? 1,
			})),
		};
	}
	if (split.mode === "PERCENTAGE") {
		return {
			mode: "PERCENTAGE",
			ownerIncluded: split.ownerIncluded,
			participants: participants.map(participant => ({
				debtPersonId: participant.debtPersonId,
				description: participant.description ?? undefined,
				percentage: Number(participant.percentage),
			})),
			remainderDebtPersonId: split.remainderDebtPersonId ?? undefined,
		};
	}
	return {
		mode: "FIXED",
		ownerIncluded: split.ownerIncluded,
		participants: participants.map(participant => ({
			debtPersonId: participant.debtPersonId,
			description: participant.description ?? undefined,
			fixedAmount: Number(participant.fixedAmount),
		})),
		remainderDebtPersonId: split.remainderDebtPersonId ?? undefined,
	};
}

export async function replaceDebtSplit(input: {
	amount: number;
	currency?: string;
	split: DebtSplitInput | null;
	target: DebtSplitTarget;
	userId: string;
}) {
	return withRawTransaction(async query => {
		const [field, targetId] = targetEntry(input.target);
		const [existing] = await query<{ id: string; userId: string; currency: string }>(
			`SELECT "id","userId","currency" FROM "DebtSplit" WHERE "${field}"=$1 FOR UPDATE`,
			[targetId],
		);
		if (existing && existing.userId !== input.userId) throw new HttpException("Rateio indisponível", 403);
		if (input.split === null) {
			if (existing) await query(`DELETE FROM "DebtSplit" WHERE "id"=$1`, [existing.id]);
			return;
		}
		const next = input.split;
		const calculated = calculateDebtSplitOrThrow(
			input.amount,
			next,
			input.currency ?? existing?.currency ?? "BRL",
		);
		await assertParticipantsOwned(next, input.userId);
		const splitId = existing?.id ?? crypto.randomUUID();
		const ownerIncluded = next.mode === "SHARES" ? next.ownerShares !== null : next.ownerIncluded;
		const values = [
			next.mode,
			ownerIncluded,
			next.mode === "SHARES" ? next.ownerShares : null,
			next.mode === "SHARES" ? null : (next.remainderDebtPersonId ?? null),
			input.userId,
		];
		if (existing)
			await query(
				`UPDATE "DebtSplit" SET "mode"=$1,"ownerIncluded"=$2,"ownerShares"=$3,"remainderDebtPersonId"=$4,"userId"=$5,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$6`,
				[...values, splitId],
			);
		else
			await query(
				`INSERT INTO "DebtSplit" ("mode","ownerIncluded","ownerShares","remainderDebtPersonId","userId","id","${field}") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
				[...values, splitId, targetId],
			);
		await query(`UPDATE "DebtSplit" SET "currency"=$1 WHERE "id"=$2`, [
			input.currency ?? existing?.currency ?? "BRL",
			splitId,
		]);
		const oldParticipants = await query<{ id: string; debtPersonId: string }>(
			`SELECT "id","debtPersonId" FROM "DebtSplitParticipant" WHERE "debtSplitId"=$1`,
			[splitId],
		);
		await query(
			`DELETE FROM "DebtSplitParticipant" WHERE "debtSplitId"=$1 AND NOT ("debtPersonId"=ANY($2))`,
			[splitId, next.participants.map(p => p.debtPersonId)],
		);
		for (const [sortOrder, p] of next.participants.entries()) {
			const id = oldParticipants.find(old => old.debtPersonId === p.debtPersonId)?.id ?? crypto.randomUUID();
			const shares = next.mode === "SHARES" ? (p as { shares: number }).shares : null;
			const percentage = next.mode === "PERCENTAGE" ? (p as { percentage: number }).percentage : null;
			const fixedAmount = next.mode === "FIXED" ? (p as { fixedAmount: number }).fixedAmount : null;
			await query(
				`INSERT INTO "DebtSplitParticipant" ("id","debtPersonId","debtSplitId","description","shares","percentage","fixedAmount","sortOrder") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT ("id") DO UPDATE SET "description"=EXCLUDED."description","shares"=EXCLUDED."shares","percentage"=EXCLUDED."percentage","fixedAmount"=EXCLUDED."fixedAmount","sortOrder"=EXCLUDED."sortOrder","updatedAt"=CURRENT_TIMESTAMP`,
				[
					id,
					p.debtPersonId,
					splitId,
					p.description?.trim() || null,
					shares,
					percentage,
					fixedAmount,
					sortOrder,
				],
			);
		}
		return calculated;
	});
}

export async function getDebtSplitReturn(target: DebtSplitTarget, amount: number) {
	const [field, id] = targetEntry(target);
	return (await getDebtSplitReturns(field, [{ amount, id }])).get(id) ?? null;
}

export async function getDebtSplitReturns(
	field: DebtSplitTargetField,
	entries: ReadonlyArray<{ amount: number; id: string }>,
): Promise<Map<string, DebtSplitReturn>> {
	if (entries.length === 0) return new Map();
	const ids = [...new Set(entries.map(entry => entry.id))];
	const columns: Record<DebtSplitTargetField, string> = {
		creditCardImportItemId: "creditCardImportItemId",
		creditPurchaseId: "creditPurchaseId",
		recurrenceId: "recurrenceId",
		transactionId: "transactionId",
		transactionImportItemId: "transactionImportItemId",
	};
	const splits = await queryRaw<
		{
			id: string;
			mode: string;
			currency: string;
			ownerIncluded: boolean;
			ownerShares: number | null;
			remainderDebtPersonId: string | null;
		} & Record<DebtSplitTargetField, string | null>
	>(
		`SELECT "id", "mode", "currency", "ownerIncluded", "ownerShares", "remainderDebtPersonId", "creditCardImportItemId", "transactionId", "transactionImportItemId", "creditPurchaseId", "recurrenceId" FROM "DebtSplit" WHERE "${columns[field]}"=ANY($1::varchar[])`,
		[ids],
	);

	if (splits.length === 0) return new Map();
	const participants = await queryRows(
		db.sql.public.DebtSplitParticipant.select(
			"debtSplitId",
			"debtPersonId",
			"description",
			"shares",
			"percentage",
			"fixedAmount",
			"sortOrder",
		)
			.where((fields, functions) =>
				functions.in(
					fields.debtSplitId,
					splits.map(split => split.id),
				),
			)
			.orderBy("sortOrder", { direction: "asc" })
			.build(),
	);
	const people = await queryRows(
		db.sql.public.DebtPerson.select("id", "name")
			.where((fields, functions) =>
				functions.in(fields.id, [...new Set(participants.map(participant => participant.debtPersonId))]),
			)
			.build(),
	);
	const participantsBySplit = Map.groupBy(participants, participant => participant.debtSplitId);
	const names = new Map(people.map(person => [person.id, person.name]));
	const amounts = new Map(entries.map(entry => [entry.id, entry.amount]));
	if (field === "creditPurchaseId") {
		const originals = await queryRaw<{ id: string; totalAmount: number }>(
			`SELECT "id","totalAmount" FROM "CreditPurchaseRecord" WHERE "id"=ANY($1)`,
			[ids],
		);
		for (const purchase of originals) amounts.set(purchase.id, Number(purchase.totalAmount));
	}

	const results = new Map<string, DebtSplitReturn>();
	for (const split of splits) {
		const targetId = split[field];
		if (!targetId) continue;
		const splitParticipants = participantsBySplit.get(split.id) ?? [];
		let input: DebtSplitInput;
		if (split.mode === "SHARES") {
			input = {
				mode: "SHARES",
				ownerShares: split.ownerIncluded ? (split.ownerShares ?? 1) : null,
				participants: splitParticipants.map(participant => ({
					debtPersonId: participant.debtPersonId,
					description: participant.description ?? undefined,
					shares: participant.shares ?? 1,
				})),
			};
		} else if (split.mode === "PERCENTAGE") {
			input = {
				mode: "PERCENTAGE",
				ownerIncluded: split.ownerIncluded,
				participants: splitParticipants.map(participant => ({
					debtPersonId: participant.debtPersonId,
					description: participant.description ?? undefined,
					percentage: Number(participant.percentage),
				})),
				remainderDebtPersonId: split.remainderDebtPersonId ?? undefined,
			};
		} else {
			input = {
				mode: "FIXED",
				ownerIncluded: split.ownerIncluded,
				participants: splitParticipants.map(participant => ({
					debtPersonId: participant.debtPersonId,
					description: participant.description ?? undefined,
					fixedAmount: Number(participant.fixedAmount),
				})),
				remainderDebtPersonId: split.remainderDebtPersonId ?? undefined,
			};
		}
		const calculated = calculateDebtSplitOrThrow(amounts.get(targetId) ?? 0, input, split.currency);
		results.set(targetId, {
			...calculated,
			participants: calculated.participants.map(participant => ({
				...participant,
				debtPersonName: names.get(participant.debtPersonId) ?? "Pessoa removida",
			})),
		} as DebtSplitReturn);
	}
	return results;
}

export async function copyDebtSplit(input: {
	amount: number;
	from: DebtSplitTarget;
	to: DebtSplitTarget;
	userId: string;
}) {
	const split = await getDebtSplitInput(input.from);
	if (!split) return;
	return replaceDebtSplit({ amount: input.amount, split, target: input.to, userId: input.userId });
}
