import { expect, test } from "bun:test";
import { resolveTransactionMoneySides } from "./transaction-money";

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
