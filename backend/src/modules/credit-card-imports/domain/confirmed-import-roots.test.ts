import { expect, test } from "bun:test";
import { confirmedImportRoots } from "./confirmed-import-roots";
import { selectNewImportPurchases } from "./select-new-import-purchases";

const purchase = {
	currentInstallment: 1,
	description: "AMAZON MARKETPLACE SAO PAULO",
	externalId: "pdf-first-installment",
	installmentAmount: 18.77,
	installments: 5,
	purchaseDate: "2026-01-27",
	totalAmount: 93.85,
};
const entry = {
	...purchase,
	description: "Lâminas de barbear Gillette x16",
	externalId: "previous-import-identity",
	hasImportedAmount: true,
	id: "original",
	isRefund: false,
	isStatementCharge: false,
	parentId: null,
	purchaseDate: new Date("2026-01-27T03:00:00Z"),
	purchaseId: "original",
	storeName: "Amazon",
	totalAmount: "93.77",
};

test("reimport skips the approved renamed first installment despite another external identity and rounded total", () => {
	const roots = confirmedImportRoots([purchase], [entry]);
	expect([...roots]).toEqual([[purchase.externalId, "original"]]);
	expect(selectNewImportPurchases([purchase], roots, [entry], [])).toEqual([]);
});

test("does not hide unconfirmed installments, changed amounts or incompatible plans", () => {
	for (const changed of [
		{ hasImportedAmount: false },
		{ currentInstallment: 2 },
		{ installmentAmount: 18.75 },
		{ installments: 12 },
		{ purchaseDate: new Date("2026-01-28") },
		{ isRefund: true },
		{ isStatementCharge: true },
	])
		expect(confirmedImportRoots([purchase], [{ ...entry, ...changed }]).size).toBe(0);
});

test("ambiguous confirmed or unconfirmed purchases and competing PDF rows stay in review", () => {
	for (const hasImportedAmount of [true, false]) {
		expect(
			confirmedImportRoots(
				[purchase],
				[
					entry,
					{
						...entry,
						hasImportedAmount,
						id: "another",
						purchaseId: "another",
					},
				],
			).size,
		).toBe(0);
	}
	expect(confirmedImportRoots([purchase, { ...purchase, externalId: "another-row" }], [entry]).size).toBe(0);
});

test("refunds and anticipations keep their dedicated duplicate handling", () => {
	for (const changed of [
		{ installmentAmount: -18.77 },
		{ description: "AMAZON [[anticipated:1:1877;2:1875]]" },
	])
		expect(confirmedImportRoots([{ ...purchase, ...changed }], [entry]).size).toBe(0);
});
