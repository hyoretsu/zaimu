import { describe, expect, test } from "bun:test";
import {
	addDebtSplitParticipant,
	calculateDebtSplit,
	createEqualDebtSplit,
	debtSplitError,
	debtSplitToInput,
	formatDebtSplitBadge,
	remainingDebtSplitAmount,
} from "./debt-split";

describe("calculateDebtSplit", () => {
	test("distributes equal shares and uses stable order for remaining cents", () => {
		const split = calculateDebtSplit(10, {
			mode: "SHARES",
			ownerShares: null,
			participants: [
				{ debtPersonId: "a", shares: 1 },
				{ debtPersonId: "b", shares: 1 },
				{ debtPersonId: "c", shares: 1 },
			],
		});

		expect(split?.participants.map(participant => participant.amount)).toEqual([3.34, 3.33, 3.33]);
		expect(split?.ownerAmount).toBe(0);
	});

	test("leaves the percentage remainder with the owner even when they are not included", () => {
		const split = calculateDebtSplit(99.99, {
			mode: "PERCENTAGE",
			ownerIncluded: false,
			participants: [{ debtPersonId: "a", percentage: 33.33 }],
		});

		expect(split?.participants[0].amount).toBe(33.32);
		expect(split?.ownerAmount).toBe(66.67);
	});

	test("keeps fixed participant amounts and assigns the difference to the owner even when they are not included", () => {
		const split = calculateDebtSplit(120, {
			mode: "FIXED",
			ownerIncluded: false,
			participants: [
				{ debtPersonId: "a", fixedAmount: 25 },
				{ debtPersonId: "b", fixedAmount: 35 },
			],
		});

		expect(split?.participants.map(participant => participant.amount)).toEqual([25, 35]);
		expect(split?.ownerAmount).toBe(60);
	});

	test("assigns the fixed-value remainder to the selected participant", () => {
		const split = calculateDebtSplit(120, {
			mode: "FIXED",
			ownerIncluded: false,
			participants: [
				{ debtPersonId: "a", fixedAmount: 25 },
				{ debtPersonId: "b", fixedAmount: 35 },
				{ debtPersonId: "c", fixedAmount: 0 },
			],
			remainderDebtPersonId: "c",
		});

		expect(split?.participants.map(participant => participant.amount)).toEqual([25, 35, 60]);
		expect(split?.ownerAmount).toBe(0);
	});

	test("rejects duplicate people and totals that exceed the purchase", () => {
		expect(
			debtSplitError(10, {
				mode: "FIXED",
				ownerIncluded: false,
				participants: [
					{ debtPersonId: "a", fixedAmount: 5 },
					{ debtPersonId: "a", fixedAmount: 5 },
				],
			}),
		).toBe("Cada pessoa pode aparecer uma vez.");
		expect(
			calculateDebtSplit(10, {
				mode: "PERCENTAGE",
				ownerIncluded: false,
				participants: [{ debtPersonId: "a", percentage: 100.01 }],
			}),
		).toBeNull();
	});

	test("rejects a participant without a selected person", () => {
		expect(
			calculateDebtSplit(25.31, {
				mode: "FIXED",
				ownerIncluded: false,
				participants: [
					{ debtPersonId: "person-id", fixedAmount: 12.65 },
					{ debtPersonId: "", fixedAmount: 5.31 },
				],
			}),
		).toBeNull();
	});
});

describe("addDebtSplitParticipant", () => {
	test("keeps existing and owner shares when adding a person", () => {
		const split = {
			mode: "SHARES" as const,
			ownerShares: 3,
			participants: [{ debtPersonId: "vitoria", shares: 2 }],
		};

		expect(addDebtSplitParticipant(split, false, 19.99)).toEqual({
			...split,
			participants: [...split.participants, { debtPersonId: "", shares: 1 }],
		});
	});
});

describe("createEqualDebtSplit", () => {
	test("removes allocation fields left by the previous mode", () => {
		const participants = [{ debtPersonId: "person-id", description: "Conta", shares: 1 }];

		expect(createEqualDebtSplit("FIXED", participants, false, 25.31)).toEqual({
			mode: "FIXED",
			ownerIncluded: false,
			participants: [{ debtPersonId: "person-id", description: "Conta", fixedAmount: 25.31 }],
		});
	});
});

describe("debtSplitError", () => {
	test("explains each invalid split state", () => {
		expect(
			debtSplitError(68, {
				mode: "SHARES",
				ownerShares: 1,
				participants: [],
			}),
		).toBe("Você não pode dividir uma compra sozinho.");
		expect(
			debtSplitError(68, {
				mode: "SHARES",
				ownerShares: null,
				participants: [],
			}),
		).toBe("Adicione pelo menos uma pessoa para dividir a compra.");
		expect(
			debtSplitError(68, {
				mode: "SHARES",
				ownerShares: 1,
				participants: [{ debtPersonId: "a", shares: 0 }],
			}),
		).toBe("Cada pessoa deve ter um valor positivo para a divisão.");
	});

	test("does not show a split-value error while the total is empty", () => {
		expect(
			debtSplitError(0, {
				mode: "SHARES",
				ownerShares: null,
				participants: [{ debtPersonId: "a", shares: 1 }],
			}),
		).toBeNull();
	});
});

describe("remainingDebtSplitAmount", () => {
	test("keeps a fully distributed amount at zero", () => {
		expect(remainingDebtSplitAmount(19.99, 9.99, 10)).toBe(0);
	});
});

describe("formatDebtSplitBadge", () => {
	const formatAmount = (amount: number) => `R$ ${amount.toFixed(2)}`;

	test("hides the amount when a single person owes the entire transaction", () => {
		expect(
			formatDebtSplitBadge(
				{
					mode: "SHARES",
					ownerAmount: 0,
					ownerShares: null,
					participants: [{ amount: 119, debtPersonId: "vitoria", debtPersonName: "Vitória", shares: 1 }],
				},
				formatAmount,
			),
		).toBe("Vitória");
	});

	test("keeps values when the debt is partial or split between people", () => {
		expect(
			formatDebtSplitBadge(
				{
					mode: "SHARES",
					ownerAmount: 20,
					ownerShares: 1,
					participants: [{ amount: 80, debtPersonId: "vitoria", debtPersonName: "Vitória", shares: 4 }],
				},
				formatAmount,
			),
		).toBe("Vitória: R$ 80.00");
	});
});

describe("debtSplitToInput", () => {
	test("removes calculated fields before editing and sending the split", () => {
		expect(
			debtSplitToInput({
				mode: "SHARES",
				ownerAmount: 5,
				ownerShares: 1,
				participants: [
					{
						amount: 5,
						debtPersonId: "a",
						debtPersonName: "Ana",
						description: "Capa de celular",
						shares: 1,
					},
				],
			}),
		).toEqual({
			mode: "SHARES",
			ownerShares: 1,
			participants: [{ debtPersonId: "a", description: "Capa de celular", shares: 1 }],
		});
	});
});
