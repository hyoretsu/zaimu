import { pdfFixture } from "./pdf-fixture";

type Call = (
	action: string,
	route: string,
	method?: string,
	body?: unknown,
	measured?: boolean,
) => Promise<unknown>;
const object = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Expected invoice response object");
	return value as Record<string, unknown>;
};
const identity = (value: unknown) => {
	if (typeof value !== "string" || !value) throw new Error("Missing invoice journey identity");
	return value;
};

/** A private card keeps approvals, calendar corrections and cleanup off baseline books. */
export async function runInvoiceApprovalJourney(name: string, call: Call, label: string) {
	const account = object(
		await call(
			"setup",
			"/financial-accounts/",
			"POST",
			{
				countryCode: "BR",
				creditCard: { creditLimit: 1000000, dueDay: 24, statementDay: 17 },
				currency: "BRL",
				name: label,
				type: "CREDIT_CARD",
			},
			false,
		),
	);
	const accountId = identity(account.id);
	try {
		const cardId = identity(object(account.creditCard).id);
		const base = `/credit-cards/${cardId}`;
		const reconcile = name === "invoiceImportReconciliation";
		const count = reconcile ? 1 : 1000;
		let originalId: string | undefined;
		const form = new FormData();
		form.set(
			"file",
			new File(
				[
					pdfFixture([
						"Data de vencimento: 24 AGO 2026",
						"Período vigente: 17 JUL a 17 AGO",
						"TRANSAÇÕES DE 17 JUL A 17 AGO",
						...Array.from({ length: count }, (_, i) => `07 AGO ${label} ${i} R$ ${i + 1},00`),
					]),
				],
				"performance.pdf",
				{ type: "application/pdf" },
			),
		);
		form.set("provider", "NUBANK");
		form.set("creditCardId", cardId);
		const parsed = object(await call("parse", "/credit-card-imports/", "POST", form));
		const imported = object(parsed.creditCardImport);
		const importId = identity(imported.id);
		if (
			Number(imported.pendingItemCount) !== count ||
			!Array.isArray(imported.items) ||
			imported.items.length !== Math.min(50, count)
		)
			throw new Error("Invoice approval fixture lost records");
		// Create after parsing so automatic unique matching cannot consume the manual journey.
		if (reconcile) {
			const created = await call(
				"setupPurchase",
				`${base}/purchases`,
				"POST",
				{
					currency: "BRL",
					description: `${label} 0`,
					installments: 1,
					purchaseDate: "2026-08-07",
					time: null,
					totalAmount: 1,
				},
				false,
			);
			const row = object(Array.isArray(created) ? created[0] : created);
			originalId = identity(row.purchaseId ?? row.id);
		}
		if (reconcile) {
			const itemId = identity(object(imported.items[0]).id);
			await call("reconcile", `/credit-card-imports/${importId}/items/${itemId}/reconcile`, "POST", {
				creditPurchaseId: originalId,
			});
		}
		const approved = object(
			await call("approve", `/credit-card-imports/${importId}/approve`, "POST", {}),
		);
		if (approved.created !== count) throw new Error("Invoice approval count mismatch");
		const book = object(await call("readAfterWrite", `${base}/book`));
		if (!Array.isArray(book.purchases) || book.purchases.length !== count)
			throw new Error("Invoice approval duplicated or lost purchases");
		const purchases = book.purchases.map(object);
		if (originalId && purchases[0]?.id !== originalId)
			throw new Error("Reconciliation replaced original purchase identity");
		const expectedByDescription = new Map(
			Array.from({ length: count }, (_, i) => [`${label} ${i}`, (i + 1) * 100]),
		);
		for (const purchase of purchases) {
			if (expectedByDescription.get(String(purchase.description)) !== purchase.totalAmountCents)
				throw new Error("Invoice approval changed item principal or description");
			expectedByDescription.delete(String(purchase.description));
		}
		if (expectedByDescription.size) throw new Error("Invoice approval lost distinct items");
		const expectedCents = ((count * (count + 1)) / 2) * 100;
		if (
			purchases.reduce((sum, row) => sum + Number(row.totalAmountCents), 0) !== expectedCents ||
			purchases.some(
				row =>
					!Array.isArray(row.installmentAmountsCents) ||
					row.installmentAmountsCents.reduce((sum: number, amount: number) => sum + amount, 0) !==
						row.totalAmountCents,
			)
		)
			throw new Error("Invoice approval did not conserve principal");
	} finally {
		// Account deletion cascades its private card, approved import and materialized book.
		await call("cleanupAccount", `/financial-accounts/${accountId}`, "DELETE", undefined, false);
	}
}
