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

function renderItem(accountName?: string) {
	return renderToStaticMarkup(
		<TooltipProvider>
			<RecurringListItem
				deleting={false}
				item={{ ...item, accountName }}
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
