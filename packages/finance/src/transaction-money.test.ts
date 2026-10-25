import { expect, test } from "bun:test";
import { cardPaymentAmount, resolveTransactionMoneySides } from "./transaction-money";

test("transfer preserves debit and rounds native credit using ISO precision", async () => {
	const sides = await resolveTransactionMoneySides(
		{ amount: 100, currency: "USD", destinationCurrency: "JPY" },
		async () => 149.123,
	);
	expect(sides.destinationAmount).toBe(14912);
	expect(sides.destinationCurrency).toBe("JPY");
	expect(sides.conversionSource).toBe("DAILY");
});
test("actual card payment survives unavailable daily rates", async () => {
	const sides = await resolveTransactionMoneySides(
		{ amount: 500, currency: "BRL", paymentAmount: 27.123, paymentCurrency: "KWD" },
		async () => {
			throw new Error("offline");
		},
	);
	expect(sides.paymentAmount).toBe(27.123);
	expect(sides.conversionSource).toBe("MANUAL");
});
test("rejects fractional yen and missing destination", async () => {
	await expect(
		resolveTransactionMoneySides(
			{ amount: 1, currency: "USD", destinationAmount: 1.5, destinationCurrency: "JPY" },
			async () => 1,
		),
	).rejects.toThrow();
	await expect(
		resolveTransactionMoneySides({ amount: 1, currency: "USD", paymentAmount: 1 }, async () => 1),
	).rejects.toThrow();
});

test("editing same-currency amounts ignores stale hidden conversion values", async () => {
	const sides = await resolveTransactionMoneySides(
		{
			amount: 1863.01,
			currency: "BRL",
			destinationAmount: 1434.35,
			destinationCurrency: "BRL",
			paymentAmount: 1434.35,
			paymentCurrency: "BRL",
		},
		async () => {
			throw new Error("unexpected conversion");
		},
	);
	expect(sides.paymentAmount).toBe(1863.01);
	expect(sides.destinationAmount).toBe(1863.01);
});

test("legacy same-currency payments settle corrected imports without carrying phantom debt", async () => {
	const { calculateStatementBalances } = await import("./credit-card");
	const payment = {
		amount: "1863.01",
		bookingCurrency: "BRL",
		paymentAmount: "1434.35",
		paymentCurrency: "BRL",
	};
	const rows = calculateStatementBalances(
		[
			{ dueDate: "2026-10-20", id: "oct", statementDate: "2026-10-15", totalAmount: 1863.01 },
			{ dueDate: "2026-11-20", id: "nov", statementDate: "2026-11-15", totalAmount: 912.14 },
			{ dueDate: "2026-12-20", id: "dec", statementDate: "2026-12-15", totalAmount: 475.7 },
		],
		[{ amount: cardPaymentAmount(payment, "BRL"), date: "2026-10-20" }],
		"2026-10-25",
	);
	expect(rows[0]).toMatchObject({ balanceAmount: 0, carriedOutAmount: 0, isPaid: true, status: "PAID" });
	expect(rows[1]).toMatchObject({ balanceAmount: 912.14, carriedInAmount: 0, invoiceAmount: 912.14 });
	expect(rows[2]).toMatchObject({ carriedInAmount: 0, invoiceAmount: 475.7 });
	expect(cardPaymentAmount({ ...payment, bookingCurrency: "USD" }, "BRL")).toBe(1434.35);
	expect(cardPaymentAmount({ amount: 100 })).toBe(100);
});
