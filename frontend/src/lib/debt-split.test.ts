import { describe, expect, test } from "bun:test";
import {
	addDebtSplitParticipant,
	calculateDebtSplit,
	createEqualDebtSplit,
	debtSplitError,
	debtSplitToInput,
	formatDebtSplitBadge,
	formatDebtSplitNames,
	remainingDebtSplitAmount,
	selectDebtSplitRemainder,
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

		expect(addDebtSplitParticipant(split)).toEqual({
			...split,
			participants: [...split.participants, { debtPersonId: "", shares: 1 }],
		});
	});

	test("preserves fixed debts when adding a person, including an automatic remainder", () => {
		const split = {
			mode: "FIXED" as const,
			ownerIncluded: false,
			participants: [
				{ debtPersonId: "ana", fixedAmount: 60 },
				{ debtPersonId: "bia", fixedAmount: 0 },
			],
			remainderDebtPersonId: "bia",
		};

		expect(addDebtSplitParticipant(split)).toEqual({
			...split,
			participants: [...split.participants, { debtPersonId: "", fixedAmount: 0 }],
		});
		expect(split.participants[0].fixedAmount).toBe(60);
	});

	test("preserves percentages when adding a person", () => {
		const split = {
			mode: "PERCENTAGE" as const,
			ownerIncluded: false,
			participants: [{ debtPersonId: "ana", percentage: 75 }],
		};

		expect(addDebtSplitParticipant(split)).toEqual({
			...split,
			participants: [...split.participants, { debtPersonId: "", percentage: 0 }],
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

describe("formatDebtSplitNames", () => {
	test("sorts reconciliation names alphabetically without mutating participants", () => {
		const participants = [
			{ amount: 10, debtPersonId: "e", debtPersonName: "Eduarda", shares: 1 },
			{ amount: 20, debtPersonId: "v", debtPersonName: "Vitória", shares: 2 },
			{ amount: 10, debtPersonId: "p", debtPersonName: "Painho", shares: 1 },
		];
		expect(formatDebtSplitNames({ mode: "SHARES", ownerAmount: 0, ownerShares: null, participants })).toBe(
			"Eduarda, Painho, Vitória",
		);
		expect(participants.map(person => person.debtPersonId)).toEqual(["e", "v", "p"]);
		expect(formatDebtSplitNames(null)).toBeUndefined();
		expect(formatDebtSplitNames(undefined)).toBeUndefined();
	});
});

describe("formatDebtSplitBadge", () => {
	const formatAmount = (amount: number) => `R$ ${amount.toFixed(2)}`;

	test("sorts people by name without changing their amounts or the source order", () => {
		const participants = [
			{ amount: 6.66, debtPersonId: "p", debtPersonName: "Painho", shares: 1 },
			{ amount: 13.33, debtPersonId: "v", debtPersonName: "Vitória", shares: 2 },
			{ amount: 5, debtPersonId: "a", debtPersonName: "Álvaro", shares: 1 },
		];
		expect(
			formatDebtSplitBadge({ mode: "SHARES", ownerAmount: 0, ownerShares: null, participants }, formatAmount),
		).toBe("Álvaro: R$ 5.00 · Painho: R$ 6.66 · Vitória: R$ 13.33");
		expect(participants.map(person => person.debtPersonId)).toEqual(["p", "v", "a"]);
	});

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

describe("selectDebtSplitRemainder", () => {
	test("replaces a fixed amount with the remainder even when the previous total exceeded the purchase", () => {
		const original = {
			mode: "FIXED" as const,
			ownerIncluded: false,
			participants: [
				{ debtPersonId: "a", fixedAmount: 22.8 },
				{ debtPersonId: "b", description: "Almoço", fixedAmount: 16.4 },
			],
		};
		const input = selectDebtSplitRemainder(original, "b");
		expect(input.participants[1]).toEqual({ debtPersonId: "b", description: "Almoço", fixedAmount: 0 });
		expect(original.participants[1].fixedAmount).toBe(16.4);
		expect(debtSplitError(32.8, input)).toBeNull();
		expect(calculateDebtSplit(32.8, input)?.participants.map(item => item.amount)).toEqual([22.8, 10]);
		expect(calculateDebtSplit(40, input)?.participants.map(item => item.amount)).toEqual([22.8, 17.2]);
		expect(calculateDebtSplit(32.8, input)?.ownerAmount).toBe(0);
	});

	test("replaces a percentage with the automatically calculated remainder", () => {
		const input = selectDebtSplitRemainder(
			{
				mode: "PERCENTAGE",
				ownerIncluded: true,
				participants: [
					{ debtPersonId: "a", percentage: 70 },
					{ debtPersonId: "b", percentage: 50 },
				],
			},
			"b",
		);
		expect(input.participants[1]).toEqual({ debtPersonId: "b", percentage: 0 });
		expect(debtSplitError(99.99, input)).toBeNull();
		expect(calculateDebtSplit(99.99, input)?.participants.map(item => item.amount)).toEqual([69.99, 30]);
		expect(calculateDebtSplit(99.99, input)?.ownerAmount).toBe(0);
	});

	test("keeps automatic allocation when other participants change", () => {
		const input = selectDebtSplitRemainder(
			{
				mode: "FIXED",
				ownerIncluded: false,
				participants: [
					{ debtPersonId: "a", fixedAmount: 15 },
					{ debtPersonId: "b", fixedAmount: 10 },
				],
			},
			"b",
		);
		const updated = {
			...input,
			participants: [{ debtPersonId: "a", fixedAmount: 20 }, input.participants[1]],
		};
		expect(calculateDebtSplit(30, updated as typeof input)?.participants.map(item => item.amount)).toEqual([
			20, 10,
		]);
	});

	test("returns to manual entry when unchecked without restoring the discarded amount", () => {
		const input = selectDebtSplitRemainder(
			{
				mode: "FIXED",
				ownerIncluded: false,
				participants: [{ debtPersonId: "a", fixedAmount: 10 }],
			},
			"a",
		);
		const unchecked = selectDebtSplitRemainder(input);
		expect(unchecked).toEqual({
			mode: "FIXED",
			ownerIncluded: false,
			participants: [{ debtPersonId: "a", fixedAmount: 0 }],
			remainderDebtPersonId: undefined,
		});
		expect(debtSplitError(30, unchecked)).toBe("Cada pessoa deve ter um valor positivo para a divisão.");
	});

	test("still rejects allocations that leave no positive remainder", () => {
		for (const fixedAmount of [30, 40]) {
			const input = selectDebtSplitRemainder(
				{
					mode: "FIXED",
					ownerIncluded: false,
					participants: [
						{ debtPersonId: "a", fixedAmount },
						{ debtPersonId: "b", fixedAmount: 10 },
					],
				},
				"b",
			);
			expect(calculateDebtSplit(30, input)).toBeNull();
			expect(debtSplitError(30, input)).not.toBeNull();
		}
	});
});

describe("automatic remainder across editing and mode changes", () => {
	test("keeps the recipient automatic when redistributing or switching modes", () => {
		const participants = [{ debtPersonId: "a" }, { debtPersonId: "b" }];
		for (const mode of ["FIXED", "PERCENTAGE"] as const) {
			const input = createEqualDebtSplit(mode, participants, false, 32.8, "b");
			expect(input.participants[1]).toEqual(
				mode === "FIXED" ? { debtPersonId: "b", fixedAmount: 0 } : { debtPersonId: "b", percentage: 0 },
			);
			expect(calculateDebtSplit(32.8, input)?.participants.map(item => item.amount)).toEqual([16.4, 16.4]);
		}
	});

	test("clears the recipient's stored value when reopening an existing split", () => {
		const input = debtSplitToInput({
			mode: "FIXED",
			ownerAmount: 0,
			ownerIncluded: false,
			participants: [
				{ amount: 22.8, debtPersonId: "a", debtPersonName: "Ana", fixedAmount: 22.8 },
				{ amount: 10, debtPersonId: "b", debtPersonName: "Bia", fixedAmount: 5 },
			],
			remainderDebtPersonId: "b",
		});
		expect(input.participants[1]).toEqual({ debtPersonId: "b", description: undefined, fixedAmount: 0 });
		expect(calculateDebtSplit(32.8, input)?.participants.map(item => item.amount)).toEqual([22.8, 10]);
	});
});

test("native split preserves JPY remainder and KWD thousandths", () => {
	const split = calculateDebtSplit(
		100,
		{
			mode: "SHARES",
			ownerShares: null,
			participants: [
				{ debtPersonId: "a", shares: 1 },
				{ debtPersonId: "b", shares: 1 },
				{ debtPersonId: "c", shares: 1 },
			],
		},
		"JPY",
	);
	expect(split?.participants.map(row => row.amount)).toEqual([34, 33, 33]);
	const fixed = calculateDebtSplit(
		1.001,
		{ mode: "FIXED", ownerIncluded: true, participants: [{ debtPersonId: "a", fixedAmount: 0.333 }] },
		"KWD",
	);
	expect(fixed?.ownerAmount).toBe(0.668);
	expect(fixed?.participants[0]?.amount).toBe(0.333);
	expect(
		calculateDebtSplit(
			1.1,
			{ mode: "SHARES", ownerShares: null, participants: [{ debtPersonId: "a", shares: 1 }] },
			"JPY",
		),
	).toBeNull();
});

test("fixed KWD split reports an excess of one minimum unit", () => {
	expect(
		debtSplitError(
			1.001,
			{
				mode: "FIXED",
				ownerIncluded: false,
				participants: [{ debtPersonId: "a", fixedAmount: 1.002 }],
			},
			"KWD",
		),
	).toBe("Os valores das pessoas não podem ultrapassar o total.");
});
