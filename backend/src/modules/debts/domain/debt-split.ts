export type DebtSplitInput =
	| {
			mode: "SHARES";
			ownerShares: null | number;
			participants: Array<{ debtPersonId: string; description?: string; shares: number }>;
	  }
	| {
			mode: "PERCENTAGE";
			ownerIncluded: boolean;
			remainderDebtPersonId?: string;
			participants: Array<{ debtPersonId: string; description?: string; percentage: number }>;
	  }
	| {
			mode: "FIXED";
			ownerIncluded: boolean;
			remainderDebtPersonId?: string;
			participants: Array<{ debtPersonId: string; description?: string; fixedAmount: number }>;
	  };

export type CalculatedDebtSplit = DebtSplitInput & {
	ownerAmount: number;
	participants: Array<DebtSplitInput["participants"][number] & { amount: number }>;
};

export class DebtSplitValidationError extends Error {}

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (amount: number) => amount / 100;

function assertBaseInput(totalCents: number, split: DebtSplitInput) {
	if (!Number.isSafeInteger(totalCents) || totalCents <= 0)
		throw new DebtSplitValidationError("Informe um valor maior que zero");
	if (split.participants.length === 0)
		throw new DebtSplitValidationError("Adicione pelo menos uma pessoa ao rateio");
	const ids = split.participants.map(participant => participant.debtPersonId);
	if (ids.some(id => !id)) throw new DebtSplitValidationError("Selecione todas as pessoas do rateio");
	if (new Set(ids).size !== ids.length)
		throw new DebtSplitValidationError("Cada pessoa pode aparecer apenas uma vez no rateio");
	if (split.mode !== "SHARES" && split.remainderDebtPersonId && !ids.includes(split.remainderDebtPersonId))
		throw new DebtSplitValidationError("Selecione uma pessoa do rateio para ficar com o restante");
}

function assignRemainder(
	participantCents: number[],
	remainderCents: number,
	participants: DebtSplitInput["participants"],
	remainderDebtPersonId?: string,
) {
	if (!remainderDebtPersonId) return { ownerCents: remainderCents, participantCents };
	const remainderIndex = participants.findIndex(
		participant => participant.debtPersonId === remainderDebtPersonId,
	);
	participantCents[remainderIndex] += remainderCents;
	return { ownerCents: 0, participantCents };
}

function allocateByLargestRemainder(totalCents: number, values: number[], denominator: number) {
	const allocated = values.map(value => Math.floor((totalCents * value) / denominator));
	let remainder = totalCents - allocated.reduce((sum, value) => sum + value, 0);
	const order = values
		.map((value, index) => ({ index, remainder: (totalCents * value) % denominator }))
		.toSorted((left, right) => right.remainder - left.remainder || left.index - right.index);
	for (let index = 0; remainder > 0; index++, remainder--) {
		allocated[order[index % order.length].index]++;
	}
	return allocated;
}

function assertPositiveAllocations(ownerCents: number, participantCents: number[], ownerIncluded: boolean) {
	if (participantCents.some(amount => amount < 1))
		throw new DebtSplitValidationError("Cada pessoa deve receber pelo menos R$ 0,01");
	if (ownerIncluded && ownerCents < 1)
		throw new DebtSplitValidationError("Sua parte deve ser de pelo menos R$ 0,01");
}

export function calculateDebtSplit(amount: number, split: DebtSplitInput): CalculatedDebtSplit {
	const totalCents = toCents(amount);
	assertBaseInput(totalCents, split);

	if (split.mode === "SHARES") {
		const shares = split.participants.map(participant => participant.shares);
		if (shares.some(value => !Number.isInteger(value) || value <= 0))
			throw new DebtSplitValidationError("As cotas devem ser números inteiros positivos");
		if (split.ownerShares !== null && (!Number.isInteger(split.ownerShares) || split.ownerShares <= 0))
			throw new DebtSplitValidationError("Sua quantidade de cotas deve ser um inteiro positivo");
		const denominator = shares.reduce((sum, value) => sum + value, split.ownerShares ?? 0);
		const participantCents = split.ownerShares
			? shares.map(value => Math.floor((totalCents * value) / denominator))
			: allocateByLargestRemainder(totalCents, shares, denominator);
		const ownerCents = totalCents - participantCents.reduce((sum, value) => sum + value, 0);
		assertPositiveAllocations(ownerCents, participantCents, split.ownerShares !== null);
		return {
			...split,
			ownerAmount: fromCents(ownerCents),
			participants: split.participants.map((participant, index) => ({
				...participant,
				amount: fromCents(participantCents[index]),
			})),
		};
	}

	if (split.mode === "PERCENTAGE") {
		const percentageUnits = split.participants.map(participant => Math.round(participant.percentage * 100));
		if (
			split.participants.some(
				(participant, index) =>
					!Number.isFinite(participant.percentage) ||
					participant.percentage < 0 ||
					(participant.percentage === 0 && participant.debtPersonId !== split.remainderDebtPersonId) ||
					Math.abs(participant.percentage * 100 - percentageUnits[index]) > 1e-7,
			)
		)
			throw new DebtSplitValidationError("Percentuais devem ser positivos e ter até duas casas decimais");
		const percentageTotal = percentageUnits.reduce((sum, value) => sum + value, 0);
		if (percentageTotal > 10_000)
			throw new DebtSplitValidationError("Os percentuais das pessoas não podem ultrapassar 100%");
		const participantCents = percentageUnits.map(value => Math.floor((totalCents * value) / 10_000));
		const { ownerCents, participantCents: allocatedParticipantCents } = assignRemainder(
			participantCents,
			totalCents - participantCents.reduce((sum, value) => sum + value, 0),
			split.participants,
			split.remainderDebtPersonId,
		);
		assertPositiveAllocations(ownerCents, allocatedParticipantCents, false);
		return {
			...split,
			ownerAmount: fromCents(ownerCents),
			participants: split.participants.map((participant, index) => ({
				...participant,
				amount: fromCents(allocatedParticipantCents[index]),
			})),
		};
	}

	const participantCents = split.participants.map(participant => toCents(participant.fixedAmount));
	if (
		split.participants.some(
			(participant, index) =>
				!Number.isFinite(participant.fixedAmount) ||
				participant.fixedAmount < 0 ||
				(participant.fixedAmount === 0 && participant.debtPersonId !== split.remainderDebtPersonId) ||
				Math.abs(participant.fixedAmount * 100 - participantCents[index]) > 1e-7,
		)
	)
		throw new DebtSplitValidationError("Valores fixos devem ser positivos e ter até duas casas decimais");
	const distributedCents = participantCents.reduce((sum, value) => sum + value, 0);
	if (distributedCents > totalCents)
		throw new DebtSplitValidationError("Os valores das pessoas não podem ultrapassar o total");
	const { ownerCents, participantCents: allocatedParticipantCents } = assignRemainder(
		participantCents,
		totalCents - distributedCents,
		split.participants,
		split.remainderDebtPersonId,
	);
	assertPositiveAllocations(ownerCents, allocatedParticipantCents, false);
	return {
		...split,
		ownerAmount: fromCents(ownerCents),
		participants: split.participants.map((participant, index) => ({
			...participant,
			amount: fromCents(allocatedParticipantCents[index]),
		})),
	};
}
