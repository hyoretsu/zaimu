import { describe, expect, test } from "bun:test";
import { calculateDebtSplit, DebtSplitValidationError } from "./debt-split";

describe("calculateDebtSplit", () => {
	test("divide cotas e deixa arredondamento com titular", () => {
		const result = calculateDebtSplit(10, {
			mode: "SHARES",
			ownerShares: 1,
			participants: [
				{ debtPersonId: "ana", shares: 1 },
				{ debtPersonId: "bia", shares: 1 },
			],
		});
		expect(result.ownerAmount).toBe(3.34);
		expect(result.participants.map(item => item.amount)).toEqual([3.33, 3.33]);
	});

	test("distribui maior resto por ordem sem titular", () => {
		const result = calculateDebtSplit(10, {
			mode: "SHARES",
			ownerShares: null,
			participants: [
				{ debtPersonId: "ana", shares: 1 },
				{ debtPersonId: "bia", shares: 1 },
				{ debtPersonId: "caio", shares: 1 },
			],
		});
		expect(result.ownerAmount).toBe(0);
		expect(result.participants.map(item => item.amount)).toEqual([3.34, 3.33, 3.33]);
	});

	test("usa cotas proporcionais", () => {
		const result = calculateDebtSplit(30, {
			mode: "SHARES",
			ownerShares: 1,
			participants: [{ debtPersonId: "ana", shares: 2 }],
		});
		expect(result.ownerAmount).toBe(10);
		expect(result.participants[0].amount).toBe(20);
	});

	test("calcula percentuais e deixa restante com titular mesmo sem incluí-lo", () => {
		const result = calculateDebtSplit(99.99, {
			mode: "PERCENTAGE",
			ownerIncluded: false,
			participants: [
				{ debtPersonId: "ana", percentage: 20 },
				{ debtPersonId: "bia", percentage: 30 },
			],
		});
		expect(result.participants.map(item => item.amount)).toEqual([19.99, 29.99]);
		expect(result.ownerAmount).toBe(50.01);
	});

	test("deixa o arredondamento de 100% com o titular", () => {
		const result = calculateDebtSplit(10, {
			mode: "PERCENTAGE",
			ownerIncluded: false,
			participants: [
				{ debtPersonId: "ana", percentage: 33.33 },
				{ debtPersonId: "bia", percentage: 33.33 },
				{ debtPersonId: "caio", percentage: 33.34 },
			],
		});
		expect(result.participants.map(item => item.amount)).toEqual([3.33, 3.33, 3.33]);
		expect(result.ownerAmount).toBe(0.01);
	});

	test("mantém valores fixos e calcula restante do titular mesmo sem incluí-lo", () => {
		const result = calculateDebtSplit(250, {
			mode: "FIXED",
			ownerIncluded: false,
			participants: [
				{ debtPersonId: "ana", fixedAmount: 45.5 },
				{ debtPersonId: "bia", fixedAmount: 70 },
			],
		});
		expect(result.ownerAmount).toBe(134.5);
		expect(result.participants.map(item => item.amount)).toEqual([45.5, 70]);
	});

	test("atribui o restante para a pessoa selecionada", () => {
		const result = calculateDebtSplit(250, {
			mode: "FIXED",
			ownerIncluded: false,
			participants: [
				{ debtPersonId: "ana", fixedAmount: 45.5 },
				{ debtPersonId: "bia", fixedAmount: 70 },
				{ debtPersonId: "caio", fixedAmount: 0 },
			],
			remainderDebtPersonId: "caio",
		});
		expect(result.ownerAmount).toBe(0);
		expect(result.participants.map(item => item.amount)).toEqual([45.5, 70, 134.5]);
	});

	test("rejeita duplicidade, totais inválidos e parcelas zeradas", () => {
		expect(() =>
			calculateDebtSplit(10, {
				mode: "SHARES",
				ownerShares: null,
				participants: [
					{ debtPersonId: "ana", shares: 1 },
					{ debtPersonId: "ana", shares: 1 },
				],
			}),
		).toThrow(DebtSplitValidationError);
		expect(() =>
			calculateDebtSplit(10, {
				mode: "PERCENTAGE",
				ownerIncluded: false,
				participants: [{ debtPersonId: "ana", percentage: 101 }],
			}),
		).toThrow("ultrapassar 100%");
		expect(() =>
			calculateDebtSplit(10, {
				mode: "FIXED",
				ownerIncluded: false,
				participants: [{ debtPersonId: "ana", fixedAmount: 10 }],
				remainderDebtPersonId: "caio",
			}),
		).toThrow("pessoa do rateio");
		expect(() =>
			calculateDebtSplit(0.01, {
				mode: "SHARES",
				ownerShares: 1,
				participants: [{ debtPersonId: "ana", shares: 1 }],
			}),
		).toThrow("unidade mínima da moeda");
	});
});

test("ISO units preserve JPY remainders and KWD fixed allocations", () => {
	const shares = calculateDebtSplit(
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
	expect(shares.participants.map(row => row.amount)).toEqual([34, 33, 33]);
	const fixed = calculateDebtSplit(
		1.001,
		{ mode: "FIXED", ownerIncluded: true, participants: [{ debtPersonId: "a", fixedAmount: 0.333 }] },
		"KWD",
	);
	expect(fixed.ownerAmount).toBe(0.668);
	expect(fixed.participants[0]!.amount).toBe(0.333);
	expect(() =>
		calculateDebtSplit(
			1.1,
			{ mode: "SHARES", ownerShares: null, participants: [{ debtPersonId: "a", shares: 1 }] },
			"JPY",
		),
	).toThrow("precisão");
});
