import type { DebtSplitInput } from "~/modules/debts/domain";
import { calculateDebtSplit, DebtSplitValidationError } from "~/modules/debts/domain";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows, withTransaction } from "~/shared/infra/sql";
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
				if (field === "creditCardImportItemId")
					return functions.eq(fields.creditCardImportItemId, id);
				if (field === "creditPurchaseId") return functions.eq(fields.creditPurchaseId, id);
				if (field === "recurrenceId") return functions.eq(fields.recurrenceId, id);
				if (field === "transactionImportItemId")
					return functions.eq(fields.transactionImportItemId, id);
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
	const splits = await queryRows(
		db.sql.public.DebtSplit.select(
			"id",
			"mode",
			"ownerIncluded",
			"ownerShares",
			"remainderDebtPersonId",
			field,
		)
			.where((fields, functions) => functions.in(fields[field], [...new Set(ids)]))
			.build(),
	);
	if (!splits.length) return new Map();
	const participants = await queryRows(
		db.sql.public.DebtSplitParticipant.select(
			"debtSplitId",
			"debtPersonId",
			"description",
			"shares",
			"percentage",
			"fixedAmount",
		)
			.where((fields, functions) =>
				functions.in(
					fields.debtSplitId,
					splits.map(split => split.id),
				),
			)
			.orderBy("sortOrder", { direction: "asc" })
			.orderBy("id", { direction: "asc" })
			.build(),
	);
	const grouped = Map.groupBy(participants, participant => participant.debtSplitId);
	const rows = splits.map(split => ({
		...split,
		participants: grouped.get(split.id) ?? [],
		targetId: split[field]!,
	}));
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
	return withTransaction(async () => {
		const [field, targetId] = targetEntry(input.target);
		const existing = await queryFirst(
			db.sql.public.DebtSplit.select("id", "userId", "currency")
				.where((fields, functions) => functions.eq(fields[field], targetId))
				.forUpdate()
				.build(),
		);
		if (existing && existing.userId !== input.userId) throw new HttpException("Rateio indisponível", 403);
		if (input.split === null) {
			if (existing)
				await executeStatement(
					db.sql.public.DebtSplit.delete()
						.where((fields, functions) => functions.eq(fields.id, existing.id))
						.build(),
				);
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
		const values = {
			currency: input.currency ?? existing?.currency ?? "BRL",
			mode: next.mode,
			ownerIncluded,
			ownerShares: next.mode === "SHARES" ? next.ownerShares : null,
			remainderDebtPersonId: next.mode === "SHARES" ? null : (next.remainderDebtPersonId ?? null),
			userId: input.userId,
		};
		if (existing)
			await executeStatement(
				db.sql.public.DebtSplit.update({ ...values, updatedAt: new Date() })
					.where((fields, functions) => functions.eq(fields.id, splitId))
					.build(),
			);
		else
			await executeStatement(
				db.sql.public.DebtSplit.insert([{ ...values, id: splitId, [field]: targetId }]).build(),
			);
		const oldParticipants = await queryRows(
			db.sql.public.DebtSplitParticipant.select("id", "debtPersonId")
				.where((fields, functions) => functions.eq(fields.debtSplitId, splitId))
				.build(),
		);
		const retainedIds = new Set(next.participants.map(p => p.debtPersonId));
		const removedIds = oldParticipants.filter(p => !retainedIds.has(p.debtPersonId)).map(p => p.id);
		if (removedIds.length)
			await executeStatement(
				db.sql.public.DebtSplitParticipant.delete()
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.debtSplitId, splitId),
							functions.in(fields.id, removedIds),
						),
					)
					.build(),
			);
		const inserted = [];
		for (const [sortOrder, p] of next.participants.entries()) {
			const existingParticipant = oldParticipants.find(old => old.debtPersonId === p.debtPersonId);
			const participant = {
				description: p.description?.trim() || null,
				fixedAmount:
					next.mode === "FIXED" ? String((p as { fixedAmount: number }).fixedAmount) : null,
				percentage:
					next.mode === "PERCENTAGE" ? String((p as { percentage: number }).percentage) : null,
				shares: next.mode === "SHARES" ? (p as { shares: number }).shares : null,
				sortOrder,
			};
			if (existingParticipant)
				await executeStatement(
					db.sql.public.DebtSplitParticipant.update({ ...participant, updatedAt: new Date() })
						.where((fields, functions) => functions.eq(fields.id, existingParticipant.id))
						.build(),
				);
			else
				inserted.push({
					...participant,
					debtPersonId: p.debtPersonId,
					debtSplitId: splitId,
					id: crypto.randomUUID(),
				});
		}
		if (inserted.length)
			await executeStatement(db.sql.public.DebtSplitParticipant.insert(inserted).build());
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
	const splits = await queryRows(
		db.sql.public.DebtSplit.select(
			"id",
			"mode",
			"currency",
			"ownerIncluded",
			"ownerShares",
			"remainderDebtPersonId",
			"creditCardImportItemId",
			"transactionId",
			"transactionImportItemId",
			"creditPurchaseId",
			"recurrenceId",
		)
			.where((fields, functions) => functions.in(fields[field], ids))
			.build(),
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
	const people = participants.length
		? await queryRows(
				db.sql.public.DebtPerson.select("id", "name")
					.where((fields, functions) =>
						functions.in(fields.id, [...new Set(participants.map(p => p.debtPersonId))]),
					)
					.build(),
			)
		: [];

	const participantsBySplit = Map.groupBy(participants, participant => participant.debtSplitId);
	const names = new Map(people.map(person => [person.id, person.name]));
	const amounts = new Map(entries.map(entry => [entry.id, entry.amount]));
	if (field === "creditPurchaseId") {
		const originals = await queryRows(
			db.sql.public.CreditPurchaseRecord.select("id", "totalAmount")
				.where((fields, functions) => functions.in(fields.id, ids))
				.build(),
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
