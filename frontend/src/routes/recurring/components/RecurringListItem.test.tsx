import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { RecurringListItem } from "./RecurringListItem";
import type { RecurringListItemData } from "./types";

const item: RecurringListItemData = {
	active: true,
	amount: 69.9,
	day: 10,
	direction: "EXPENSE",
	frequency: "MONTHLY",
	id: "recurring-id",
	monthlyAmount: 69.9,
	source: "recurring",
	startDate: "2026-02-01",
	title: "Academia",
};

function renderItem(accountName?: string, overrides: Partial<RecurringListItemData> = {}) {
	return renderToStaticMarkup(
		<TooltipProvider>
			<RecurringListItem
				deleting={false}
				item={{ ...item, accountName, ...overrides }}
				onDelete={() => {}}
				onEdit={() => {}}
				onToggle={() => {}}
				toggling={false}
			/>
		</TooltipProvider>,
	);
}

describe("recurring account badge", () => {
	test("omits account badge when no account is selected", () => {
		const html = renderItem();
		expect(html).not.toContain("Conta sem nome");
		expect(html).not.toContain('<span class="text-muted-foreground">Conta</span>');
	});

	test("shows selected account", () => {
		const html = renderItem("Principal");
		expect(html).toContain("Principal");
	});
});

describe("recurring debt badge", () => {
	const debtSplit = {
		mode: "SHARES" as const,
		ownerAmount: 34.95,
		ownerShares: 1,
		participants: [{ amount: 34.95, debtPersonId: "person-id", debtPersonName: "Ana", shares: 1 }],
	};

	test("shows debt participant and split amount", () => {
		const html = renderItem(undefined, { debtSplit });
		expect(html).toContain("Dívida");
		expect(html).toContain("Ana: R$ 34,95");
	});

	test("formats split amounts in recurrence currency", () => {
		const html = renderItem(undefined, {
			debtSplit,
			recurrence: { currency: "USD" } as NonNullable<RecurringListItemData["recurrence"]>,
		});
		expect(html).toContain("Ana: US$ 34,95");
	});

	test("omits debt badge without a split", () => {
		expect(renderItem()).not.toContain("Dívida");
	});
});
