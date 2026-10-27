import "@/index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Tabs } from "@/components/ui/Tabs";
import type { CreditCardStatement } from "@/lib/api";
import { getStatementWindow } from "@/routes/credit-cards/components/credit-card-statement-window";
import { CreditCardStatementTabs } from "@/routes/credit-cards/components/CreditCardStatementTabs";

const statements: CreditCardStatement[] = Array.from({ length: 24 }, (_, index) => {
	const month = new Date(Date.UTC(2025, 7 + index, 15)).toISOString().slice(0, 7);
	return {
		balanceAmount: 100,
		creditCardId: "card",
		dueDate: `${month}-15`,
		id: month,
		isPaid: false,
		paidAmount: 0,
		statementDate: `${month}-05`,
		totalAmount: 100,
	};
});

function StatementScrollFixture() {
	const [selected, setSelected] = useState("2026-10");
	const [extra, setExtra] = useState({ next: 0, previous: 0 });
	const visible = getStatementWindow(
		{ dueDay: 15, id: "card", statementDay: 5 },
		statements,
		selected,
		3 + extra.previous,
		3 + extra.next,
	);
	return (
		<Tabs className="w-full p-4" onValueChange={setSelected} value={selected}>
			<div className="h-32 min-w-0">
				<CreditCardStatementTabs
					canLoadPrevious={visible[0]?.id !== statements[0]?.id}
					currencyCode="BRL"
					ignoreBefore={null}
					isDesktop={false}
					onLoadNext={() => setExtra(value => ({ ...value, next: value.next + 3 }))}
					onLoadPrevious={() => setExtra(value => ({ ...value, previous: value.previous + 3 }))}
					onRadiusChange={() => {}}
					selectedId={selected}
					statements={visible}
				/>
			</div>
			<output data-testid="selected">{selected}</output>
		</Tabs>
	);
}

createRoot(document.getElementById("root")!).render(
	<QueryClientProvider client={new QueryClient()}>
		<StatementScrollFixture />
	</QueryClientProvider>,
);
