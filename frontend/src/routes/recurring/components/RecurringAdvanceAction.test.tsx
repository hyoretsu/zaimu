import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { RecurringListItem } from "./RecurringListItem";
import type { RecurringListItemData } from "./types";

const item: RecurringListItemData = {
	active: true,
	amount: 100,
	day: 10,
	direction: "EXPENSE",
	frequency: "MONTHLY",
	id: "recurrence",
	monthlyAmount: 100,
	source: "recurring",
	startDate: "2026-01-01",
	title: "Academia",
};

function render(overrides: Partial<RecurringListItemData> = {}, pending = false) {
	return renderToStaticMarkup(
		<TooltipProvider>
			<RecurringListItem
				deleting={false}
				item={{ ...item, ...overrides }}
				onAdvance={() => {}}
				onDelete={() => {}}
				onEdit={() => {}}
				onToggle={() => {}}
				toggling={pending}
			/>
		</TooltipProvider>,
	);
}

test("active recurrence offers advance action", () => {
	expect(render()).toContain('aria-label="Adiantar para hoje"');
});

test("paused and ended recurrences do not offer advance action", () => {
	expect(render({ active: false })).not.toContain('aria-label="Adiantar para hoje"');
	expect(render({ endDate: "2020-01-01" })).not.toContain('aria-label="Adiantar para hoje"');
});

test("pending recurrence blocks advance action", () => {
	expect(render({}, true)).toMatch(/<button[^>]*aria-label="Adiantar para hoje"[^>]*disabled=""/);
});
