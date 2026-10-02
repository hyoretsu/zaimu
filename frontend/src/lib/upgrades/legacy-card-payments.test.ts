import { expect, test } from "bun:test";
import { migrateLegacyCardPayments } from "./legacy-card-payments";

test("migrates guest and cached payments preserving metadata and scope", () => {
	const payments = ["guest:a", "user:b"].map(ownerKey => ({
		data: {
			amount: 120,
			creditCardStatementId: "invoice",
			date: "2024-08-20",
			id: "payment",
			originFinancialAccountId: "payer",
			time: "14:30",
		},
		deleted: false,
		localId: "payment",
		modifiedAt: 123,
		ownerKey,
		syncedAt: 110,
	}));
	const statements = ["guest:a", "user:b"].map(ownerKey => ({
		data: { creditCardId: `card-${ownerKey}`, id: "invoice" },
		ownerKey,
	}));
	const result = migrateLegacyCardPayments(payments, statements);
	for (const [index, row] of result.entries())
		expect({ ...row }).toEqual({
			...payments[index],
			data: {
				amount: 120,
				date: "2024-08-20",
				id: "payment",
				originFinancialAccountId: "payer",
				paymentCreditCardId: `card-${row.ownerKey}`,
				time: "14:30",
			},
		});
	expect(migrateLegacyCardPayments(result, statements)).toEqual(result);
});
test("keeps unresolved or conflicting legacy references and does not use another owner", () => {
	const payments = [{ data: { creditCardStatementId: "invoice" }, ownerKey: "guest:a" }];
	expect(
		migrateLegacyCardPayments(payments, [
			{ data: { creditCardId: "other", id: "invoice" }, ownerKey: "user:b" },
		]),
	).toEqual(payments);
	const conflict = [
		{ data: { creditCardStatementId: "invoice", paymentCreditCardId: "chosen" }, ownerKey: "guest:a" },
	];
	expect(
		migrateLegacyCardPayments(conflict, [
			{ data: { creditCardId: "other", id: "invoice" }, ownerKey: "guest:a" },
		]),
	).toEqual(conflict);
});
