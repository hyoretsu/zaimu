import type { CalculatedDebtSplit, DebtSplitInput } from "~/modules/debts/domain";
import { calculateDebtSplit, DebtSplitValidationError } from "~/modules/debts/domain";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";

export type DebtSplitTarget =
	| { creditCardImportItemId: string }
	| { creditPurchaseId: string }
	| { recurringPaymentId: string }
	| { subscriptionId: string }
	| { transactionImportItemId: string }
	| { transactionId: string };

export type DebtSplitTargetField =
	| "creditCardImportItemId"
	| "creditPurchaseId"
	| "recurringPaymentId"
	| "subscriptionId"
	| "transactionImportItemId"
	| "transactionId";
const targetEntry = (target: DebtSplitTarget) => Object.entries(target)[0] as [DebtSplitTargetField, string];

export type DebtSplitReturn = Omit<CalculatedDebtSplit, "participants"> & {
	participants: Array<CalculatedDebtSplit["participants"][number] & { debtPersonName: string }>;
};

export function calculateDebtSplitOrThrow(amount: number, split: DebtSplitInput) {
	try {
		return calculateDebtSplit(amount, split);
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
			"subscriptionId",
			"recurringPaymentId",
		)
			.where((fields, functions) => {
				if (field === "creditCardImportItemId") return functions.eq(fields.creditCardImportItemId, id);
				if (field === "creditPurchaseId") return functions.eq(fields.creditPurchaseId, id);
				if (field === "recurringPaymentId") return functions.eq(fields.recurringPaymentId, id);
				if (field === "subscriptionId") return functions.eq(fields.subscriptionId, id);
				if (field === "transactionImportItemId") return functions.eq(fields.transactionImportItemId, id);
				return functions.eq(fields.transactionId, id);
			})
			.limit(1)
			.build(),
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
	split: DebtSplitInput | null;
	target: DebtSplitTarget;
	userId: string;
}) {
	const existing = await findSplit(input.target);
	if (input.split === null) {
		if (existing)
			await executeStatement(
				db.sql.public.DebtSplit.delete()
					.where((fields, functions) => functions.eq(fields.id, existing.id))
					.build(),
			);
		return;
	}
	const nextSplit = input.split;
	const calculated = calculateDebtSplitOrThrow(input.amount, nextSplit);
	await assertParticipantsOwned(nextSplit, input.userId);
	if (existing)
		await executeStatement(
			db.sql.public.DebtSplit.delete()
				.where((fields, functions) => functions.eq(fields.id, existing.id))
				.build(),
		);
	const ownerIncluded =
		nextSplit.mode === "SHARES" ? nextSplit.ownerShares !== null : nextSplit.ownerIncluded;
	const split = await queryFirst(
		db.sql.public.DebtSplit.insert([
			{
				...input.target,
				mode: nextSplit.mode,
				ownerIncluded,
				ownerShares: nextSplit.mode === "SHARES" ? nextSplit.ownerShares : undefined,
				remainderDebtPersonId: nextSplit.mode === "SHARES" ? undefined : nextSplit.remainderDebtPersonId,
				userId: input.userId,
			},
		] as never)
			.returning("id")
			.build(),
	);
	if (!split) throw new HttpException("Rateio não criado", 500);
	await executeStatement(
		db.sql.public.DebtSplitParticipant.insert(
			nextSplit.participants.map((participant, sortOrder) => ({
				debtPersonId: participant.debtPersonId,
				debtSplitId: split.id,
				description: participant.description?.trim() || undefined,
				fixedAmount:
					nextSplit.mode === "FIXED"
						? String((participant as { fixedAmount: number }).fixedAmount)
						: undefined,
				percentage:
					nextSplit.mode === "PERCENTAGE"
						? String((participant as { percentage: number }).percentage)
						: undefined,
				shares: nextSplit.mode === "SHARES" ? (participant as { shares: number }).shares : undefined,
				sortOrder,
			})) as never,
		).build(),
	);
	return calculated;
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
			"ownerIncluded",
			"ownerShares",
			"remainderDebtPersonId",
			"creditCardImportItemId",
			"transactionId",
			"transactionImportItemId",
			"creditPurchaseId",
			"subscriptionId",
			"recurringPaymentId",
		)
			.where((fields, functions) => {
				if (field === "creditCardImportItemId") return functions.in(fields.creditCardImportItemId, ids);
				if (field === "creditPurchaseId") return functions.in(fields.creditPurchaseId, ids);
				if (field === "recurringPaymentId") return functions.in(fields.recurringPaymentId, ids);
				if (field === "subscriptionId") return functions.in(fields.subscriptionId, ids);
				if (field === "transactionImportItemId") return functions.in(fields.transactionImportItemId, ids);
				return functions.in(fields.transactionId, ids);
			})
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
		const calculated = calculateDebtSplitOrThrow(amounts.get(targetId) ?? 0, input);
		results.set(targetId, {
			...calculated,
			participants: calculated.participants.map(participant => ({
				...participant,
				debtPersonName: names.get(participant.debtPersonId) ?? "Pessoa removida",
			})),
		});
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
