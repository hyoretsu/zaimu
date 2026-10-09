import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/Tooltip";
import type { CreditPurchase } from "@/lib/api";
import { CreditPurchaseRow } from "./CreditPurchaseRow";

const purchase: CreditPurchase = {
	currentInstallment: 1,
	description: "Amazon",
	hasRefund: true,
	id: "installment",
	installmentAmount: 53.37,
	installments: 11,
	purchaseDate: "2026-04-05",
	purchaseId: "purchase",
	refunds: [
		{
			amount: 23.64,
			canceledAmount: 0,
			creditAmount: 23.64,
			date: "2026-04-07",
			id: "refund",
			policy: "KEEP_INSTALLMENTS",
		},
	],
	statementId: "statement",
	totalAmount: 586.98,
};

function render(overrides: Partial<CreditPurchase> = {}) {
	return renderToStaticMarkup(
		<TooltipProvider>
			<CreditPurchaseRow
				deleteDisabled={false}
				editDisabled={false}
				onDelete={() => {}}
				onEdit={() => {}}
				onRefinance={() => {}}
				onRefund={() => {}}
				purchase={{ ...purchase, ...overrides }}
				refinanceDisabled={false}
				refundDisabled={false}
			/>
		</TooltipProvider>,
	);
}

test("installments offer refund management without repeating refund relationships", () => {
	for (const currentInstallment of [1, 2, 11]) {
		const markup = render({ currentInstallment });
		expect(markup).toContain('aria-label="Gerenciar reembolsos de Amazon"');
		expect(markup).not.toContain("Reembolso em");
		expect(markup).not.toContain("Reembolsada");
		expect(markup).not.toContain("Compra original:");
	}
});

test("refund identifies only its original purchase", () => {
	const markup = render({
		installmentAmount: -23.64,
		installments: 1,
		isRefund: true,
		originalPurchaseDate: "2026-04-05",
		purchaseDate: "2026-04-07",
		refundOfPurchaseId: "purchase",
	});
	expect(markup).toContain("Compra original: Amazon - 05/04/2026");
	expect(markup).not.toContain("Gerenciar reembolsos de Amazon");
});
