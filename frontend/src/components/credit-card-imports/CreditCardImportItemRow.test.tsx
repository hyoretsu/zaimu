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
	taxes: [],
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

test("BRL purchase shows imported IOF as purchase tax", () => {
	const markup = renderToStaticMarkup(
		<TooltipProvider>
			<CreditCardImportItemRow
				creditCardId="card"
				creditCardName="Inter"
				currencyCode="BRL"
				disabled={false}
				item={{
					...item,
					description: "Task Bar Hero DLCs",
					installmentAmount: 54.62,
					taxes: [{ amount: 1.85, name: "IOF INTERNACIONAL" }],
					totalAmount: 54.62,
				}}
				onApprove={() => undefined}
				onEdit={() => undefined}
				onReconcile={() => undefined}
				onReviewRefund={() => undefined}
				pending={false}
			/>
		</TooltipProvider>,
	);
	expect(markup).toContain("IOF INTERNACIONAL");
	expect(markup).toContain("1,85");
	expect(markup).not.toContain("Encargo da fatura");
});

for (const [label, changes, allowed] of [
	["purchase", { installmentAmount: 25, totalAmount: 25 }, true],
	["refund", {}, false],
	["charge", { installmentAmount: 25, isStatementCharge: true }, false],
	["duplicate", { duplicates: [{ id: "original" }], installmentAmount: 25 }, false],
] as const) {
	test(`import recurrence action respects ${label} scope`, () => {
		const markup = renderToStaticMarkup(
			<TooltipProvider>
				<CreditCardImportItemRow
					creditCardId="card"
					creditCardName="Card"
					currencyCode="BRL"
					disabled={false}
					importId="import"
					item={{ ...item, ...changes } as CreditCardImportItem}
					onApprove={() => {}}
					onEdit={() => {}}
					onReconcile={() => {}}
					onReviewRefund={() => {}}
				/>
			</TooltipProvider>,
		);
		expect(markup.includes('aria-label="Aprovar e associar a recorrência"')).toBe(allowed);
		expect(markup).not.toContain('aria-label="Registrar reembolso"');
		expect(markup).not.toContain('aria-label="Reparcelar"');
	});
}
