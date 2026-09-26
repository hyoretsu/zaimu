import type { DebtSplit, DebtSplitInput } from "./api";

const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => value / 100;

export function createEqualDebtSplit(
	mode: DebtSplitInput["mode"],
	participants: Array<{ debtPersonId: string; description?: string }>,
	ownerIncluded: boolean,
	amount: number,
	remainderDebtPersonId?: string,
): DebtSplitInput {
	const participantFields = ({ debtPersonId, description }: (typeof participants)[number]) => ({
		debtPersonId,
		...(description === undefined ? {} : { description }),
	});
	if (mode === "SHARES")
		return {
			mode,
			ownerShares: ownerIncluded ? 1 : null,
			participants: participants.map(participant => ({ ...participantFields(participant), shares: 1 })),
		};
	if (mode === "PERCENTAGE") {
		const divisor = participants.length + (ownerIncluded ? 1 : 0);
		return {
			mode,
			ownerIncluded,
			...(remainderDebtPersonId ? { remainderDebtPersonId } : {}),
			participants: participants.map((participant, index) => ({
				...participantFields(participant),
				percentage:
					index === participants.length - 1 && !ownerIncluded
						? Number((100 - (Math.floor((100 / divisor) * 100) / 100) * (participants.length - 1)).toFixed(2))
						: Math.floor((100 / divisor) * 100) / 100,
			})),
		};
	}
	const totalCents = Math.max(0, Math.round(amount * 100));
	const divisor = participants.length + (ownerIncluded ? 1 : 0);
	const equalCents = divisor ? Math.floor(totalCents / divisor) : 0;
	return {
		mode,
		ownerIncluded,
		...(remainderDebtPersonId ? { remainderDebtPersonId } : {}),
		participants: participants.map((participant, index) => ({
			...participantFields(participant),
			fixedAmount:
				!ownerIncluded && index === participants.length - 1
					? (totalCents - equalCents * (participants.length - 1)) / 100
					: equalCents / 100,
		})),
	};
}

export function addDebtSplitParticipant(
	split: DebtSplitInput,
	customized: boolean,
	amount: number,
): DebtSplitInput {
	if (split.mode === "SHARES")
		return {
			...split,
			participants: [...split.participants, { debtPersonId: "", shares: 1 }],
		};
	if (!customized)
		return createEqualDebtSplit(
			split.mode,
			[...split.participants, { debtPersonId: "" }],
			split.ownerIncluded,
			amount,
			split.remainderDebtPersonId,
		);
	const participant =
		split.mode === "PERCENTAGE" ? { debtPersonId: "", percentage: 0 } : { debtPersonId: "", fixedAmount: 0 };
	return { ...split, participants: [...split.participants, participant] } as DebtSplitInput;
}

export function formatDebtSplitBadge(
	split: DebtSplit | null | undefined,
	formatAmount: (amount: number) => string,
) {
	if (!split) return undefined;
	if (split.participants.length === 1 && split.ownerAmount === 0) return split.participants[0].debtPersonName;
	return split.participants.map(item => `${item.debtPersonName}: ${formatAmount(item.amount)}`).join(" · ");
}

export function remainingDebtSplitAmount(
	totalAmount: number,
	distributedAmount: number,
	ownerAmount: number,
) {
	return money(cents(totalAmount) - cents(distributedAmount) - cents(ownerAmount));
}

export function calculateDebtSplit(amount: number, split: DebtSplitInput): DebtSplit | null {
	const total = cents(amount);
	if (total <= 0 || split.participants.length === 0) return null;
	if (split.participants.some(item => !item.debtPersonId)) return null;
	if (split.mode !== "SHARES" && split.remainderDebtPersonId === "") return null;
	if (new Set(split.participants.map(item => item.debtPersonId)).size !== split.participants.length)
		return null;
	if (
		split.mode !== "SHARES" &&
		split.remainderDebtPersonId &&
		!split.participants.some(item => item.debtPersonId === split.remainderDebtPersonId)
	)
		return null;
	let amounts: number[];
	let owner = 0;
	if (split.mode === "SHARES") {
		const values = split.participants.map(item => item.shares);
		if (values.some(value => !Number.isInteger(value) || value < 1)) return null;
		const denominator = values.reduce((sum, value) => sum + value, split.ownerShares ?? 0);
		amounts = values.map(value => Math.floor((total * value) / denominator));
		let remainder = total - amounts.reduce((sum, value) => sum + value, 0);
		if (split.ownerShares === null) {
			const order = values
				.map((value, index) => ({ index, remainder: (total * value) % denominator }))
				.toSorted((left, right) => right.remainder - left.remainder || left.index - right.index);
			for (let index = 0; remainder > 0; index++, remainder--) amounts[order[index % order.length].index]++;
		} else owner = remainder;
	} else if (split.mode === "PERCENTAGE") {
		const values = split.participants.map(item => Math.round(item.percentage * 100));
		const sum = values.reduce((result, value) => result + value, 0);
		if (
			split.participants.some(
				(item, index) =>
					!Number.isFinite(item.percentage) ||
					item.percentage < 0 ||
					(item.percentage === 0 && item.debtPersonId !== split.remainderDebtPersonId) ||
					Math.abs(item.percentage * 100 - values[index]) > 1e-7,
			) ||
			sum > 10_000
		)
			return null;
		amounts = values.map(value => Math.floor((total * value) / 10_000));
		owner = total - amounts.reduce((result, value) => result + value, 0);
	} else {
		amounts = split.participants.map(item => cents(item.fixedAmount));
		const sum = amounts.reduce((result, value) => result + value, 0);
		if (
			split.participants.some(
				(item, index) =>
					!Number.isFinite(item.fixedAmount) ||
					item.fixedAmount < 0 ||
					(item.fixedAmount === 0 && item.debtPersonId !== split.remainderDebtPersonId) ||
					Math.abs(item.fixedAmount * 100 - amounts[index]) > 1e-7,
			) ||
			sum > total
		)
			return null;
		owner = total - sum;
	}
	const remainderIndex =
		split.mode !== "SHARES" && split.remainderDebtPersonId
			? split.participants.findIndex(item => item.debtPersonId === split.remainderDebtPersonId)
			: -1;
	if (remainderIndex >= 0) {
		amounts[remainderIndex] += owner;
		owner = 0;
	}
	if (
		amounts.some(value => value < 1) ||
		(split.mode === "SHARES" && split.ownerShares !== null && owner < 1)
	)
		return null;
	return {
		...split,
		ownerAmount: money(owner),
		participants: split.participants.map((participant, index) => ({
			...participant,
			amount: money(amounts[index]),
			debtPersonName: "",
		})),
	} as DebtSplit;
}

export function debtSplitError(amount: number, split: DebtSplitInput): string | null {
	if (split.participants.length === 0)
		return (split.mode === "SHARES" ? split.ownerShares !== null : split.ownerIncluded)
			? "Você não pode dividir uma compra sozinho."
			: "Adicione pelo menos uma pessoa para dividir a compra.";
	if (split.participants.some(item => !item.debtPersonId)) return "Selecione todas as pessoas.";
	if (new Set(split.participants.map(item => item.debtPersonId)).size !== split.participants.length)
		return "Cada pessoa pode aparecer uma vez.";
	if (split.mode !== "SHARES" && split.remainderDebtPersonId === "")
		return "Selecione uma pessoa do rateio para ficar com o restante.";
	if (
		split.mode !== "SHARES" &&
		split.remainderDebtPersonId &&
		!split.participants.some(item => item.debtPersonId === split.remainderDebtPersonId)
	)
		return "Selecione uma pessoa do rateio para ficar com o restante.";
	if (
		(split.mode === "SHARES" &&
			split.participants.some(item => !Number.isInteger(item.shares) || item.shares < 1)) ||
		(split.mode === "PERCENTAGE" &&
			split.participants.some(
				item =>
					item.percentage < 0 || (item.percentage === 0 && item.debtPersonId !== split.remainderDebtPersonId),
			)) ||
		(split.mode === "FIXED" &&
			split.participants.some(
				item =>
					item.fixedAmount < 0 ||
					(item.fixedAmount === 0 && item.debtPersonId !== split.remainderDebtPersonId),
			))
	)
		return "Cada pessoa deve ter um valor positivo para a divisão.";
	if (!Number.isFinite(amount) || amount <= 0) return null;
	if (calculateDebtSplit(amount, split)) return null;
	if (split.mode === "PERCENTAGE") {
		const percentageTotal = split.participants.reduce(
			(sum, item) => sum + Math.round(item.percentage * 100),
			0,
		);
		return percentageTotal > 10_000
			? "Os percentuais das pessoas não podem ultrapassar 100%."
			: "Cada pessoa deve ter um valor positivo para a divisão.";
	}
	if (split.mode === "FIXED") {
		const distributed = split.participants.reduce((sum, item) => sum + cents(item.fixedAmount), 0);
		return distributed > cents(amount)
			? "Os valores das pessoas não podem ultrapassar o total."
			: "Cada pessoa deve ter um valor positivo para a divisão.";
	}
	return "Cada pessoa deve ter um valor positivo para a divisão.";
}

export function debtSplitToInput(split?: DebtSplit | null): DebtSplitInput {
	if (!split)
		return {
			mode: "SHARES",
			ownerShares: null,
			participants: [{ debtPersonId: "", shares: 1 }],
		};
	if (split.mode === "SHARES")
		return {
			mode: split.mode,
			ownerShares: split.ownerShares,
			participants: split.participants.map(({ debtPersonId, description, shares }) => ({
				debtPersonId,
				description,
				shares,
			})),
		};
	if (split.mode === "PERCENTAGE")
		return {
			mode: split.mode,
			ownerIncluded: split.ownerIncluded,
			participants: split.participants.map(({ debtPersonId, description, percentage }) => ({
				debtPersonId,
				description,
				percentage,
			})),
			remainderDebtPersonId: split.remainderDebtPersonId,
		};
	return {
		mode: split.mode,
		ownerIncluded: split.ownerIncluded,
		participants: split.participants.map(({ debtPersonId, description, fixedAmount }) => ({
			debtPersonId,
			description,
			fixedAmount,
		})),
		remainderDebtPersonId: split.remainderDebtPersonId,
	};
}
