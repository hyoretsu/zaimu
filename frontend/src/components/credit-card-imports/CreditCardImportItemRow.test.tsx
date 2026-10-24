import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/Tooltip";
import type { CreditCardImportItem } from "@/lib/api";

const previousWebUrl = process.env.VITE_PUBLIC_WEB_URL;
process.env.VITE_PUBLIC_WEB_URL = "http://localhost:4177";
const { CreditCardImportItemRow } = await import("./CreditCardImportItemRow");
if (previousWebUrl === undefined) delete process.env.VITE_PUBLIC_WEB_URL;
else process.env.VITE_PUBLIC_WEB_URL = previousWebUrl;

const item: CreditCardImportItem = {
	createdAt: "2026-09-04",
	currentInstallment: 1,
	description: "Reembolso",
	duplicates: [],
	id: "refund",
	installmentAmount: -249,
	installments: 1,
	isSelected: true,
	purchaseDate: "2026-09-04",
	tagIds: [],
	tags: [],
	totalAmount: -249,
	updatedAt: "2026-09-04",
};

for (const reviewed of [false, true]) {
	test(`refund review and approval are separate; approval ${reviewed ? "enabled" : "disabled"}`, () => {
		const markup = renderToStaticMarkup(
			<TooltipProvider>
				<CreditCardImportItemRow
					creditCardId="card"
					creditCardName="Card"
					currencyCode="BRL"
					disabled={false}
					item={{ ...item, refundReview: reviewed ? { purchaseId: "original" } : null }}
					onApprove={() => {}}
					onEdit={() => {}}
					onReconcile={() => {}}
					onReviewRefund={() => {}}
				/>
			</TooltipProvider>,
		);
		expect(markup).toContain('aria-label="Revisar reembolso"');
		const approve = markup.match(/<button[^>]*aria-label="Aprovar"[^>]*>/u)?.[0];
		expect(approve).toBeDefined();
		expect(approve!.includes("disabled=")).toBe(!reviewed);
	});
}
