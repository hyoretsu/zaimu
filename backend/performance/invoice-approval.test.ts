import { expect, test } from "bun:test";
import { runInvoiceApprovalJourney } from "./invoice-approval";

function fixture(
	options: {
		wrongIdentity?: boolean;
		wrongPrincipal?: boolean;
		approveFailure?: boolean;
		cleanupFailure?: boolean;
	} = {},
) {
	const calls: { action: string; route: string; measured: boolean }[] = [];
	const call = async (
		action: string,
		route: string,
		_method?: string,
		body?: unknown,
		measured = true,
	): Promise<unknown> => {
		calls.push({ action, measured, route });
		if (action === "setup") return { creditCard: { id: "private-card" }, id: "private-account" };
		if (action === "setupPurchase") return [{ purchaseId: "original" }];
		if (action === "parse") {
			if ((body as FormData).get("creditCardId") !== "private-card")
				throw new Error("Unexpected fixture card");
			return {
				creditCardImport: { id: "private-import", items: [{ id: "item" }], pendingItemCount: 1 },
			};
		}
		if (action === "approve") {
			if (options.approveFailure) throw new Error("approval failed");
			return { created: 1 };
		}
		if (action === "readAfterWrite")
			return {
				purchases: [
					{
						description: "Performance isolated 0",
						id: options.wrongIdentity ? "duplicate" : "original",
						installmentAmountsCents: [100],
						totalAmountCents: options.wrongPrincipal ? 200 : 100,
					},
				],
			};
		if (action === "cleanupAccount" && options.cleanupFailure) throw new Error("cleanup failed");
		return {};
	};
	return { call, calls };
}

test("invoice reconciliation preserves purchase identity and separates setup from measured actions", async () => {
	const { call, calls } = fixture();
	await runInvoiceApprovalJourney("invoiceImportReconciliation", call, "Performance isolated");
	expect(calls.findIndex(row => row.action === "parse")).toBeLessThan(
		calls.findIndex(row => row.action === "setupPurchase"),
	);
	expect(calls.filter(row => row.measured).map(row => row.action)).toEqual([
		"parse",
		"reconcile",
		"approve",
		"readAfterWrite",
	]);
	expect(calls.at(-1)).toEqual({
		action: "cleanupAccount",
		measured: false,
		route: "/financial-accounts/private-account",
	});
});

for (const options of [
	{ wrongIdentity: true },
	{ wrongPrincipal: true },
	{ approveFailure: true },
	{ cleanupFailure: true },
]) {
	test(`invoice journey rejects ${JSON.stringify(options)} and always attempts private cleanup`, async () => {
		const { call, calls } = fixture(options);
		await expect(
			runInvoiceApprovalJourney("invoiceImportReconciliation", call, "Performance isolated"),
		).rejects.toThrow();
		expect(calls.filter(row => row.action === "cleanupAccount")).toHaveLength(1);
	});
}

test("bulk invoice approval validates all thousand distinct amounts and private card cleanup", async () => {
	let cleaned = false;
	await runInvoiceApprovalJourney(
		"invoiceImportApproval",
		async action => {
			if (action === "setup") return { creditCard: { id: "bulk-card" }, id: "bulk-account" };
			if (action === "parse")
				return {
					creditCardImport: {
						id: "bulk-import",
						items: Array.from({ length: 50 }, (_, i) => ({ id: String(i) })),
						pendingItemCount: 1000,
					},
				};
			if (action === "approve") return { created: 1000 };
			if (action === "readAfterWrite")
				return {
					purchases: Array.from({ length: 1000 }, (_, i) => ({
						description: `Performance bulk ${i}`,
						id: String(i),
						installmentAmountsCents: [(i + 1) * 100],
						totalAmountCents: (i + 1) * 100,
					})),
				};
			if (action === "cleanupAccount") cleaned = true;
			return {};
		},
		"Performance bulk",
	);
	expect(cleaned).toBeTrue();
});
