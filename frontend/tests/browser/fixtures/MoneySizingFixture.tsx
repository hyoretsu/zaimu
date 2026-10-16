import { createRoot } from "react-dom/client";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { Input } from "@/components/ui/Input";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { DashboardPeriodFlowCard } from "@/routes/components/DashboardPeriodFlowCard";
import { DashboardProjectedCashFlowCard } from "@/routes/components/DashboardProjectedCashFlowCard";
import "@/index.css";

function MoneySizingFixture() {
	return (
		<main className="space-y-4 p-4" style={{ maxWidth: 852 }}>
			<Input aria-label="Standard input" placeholder="Ex: Texto" readOnly />
			{[64, 92, 136].map(width => (
				<div key={width} style={{ width }}>
					<NumericField
						id={`shares-${width}`}
						label="Cotas"
						onValueChange={() => {}}
						placeholder="Ex: 2"
						value="2"
					/>
					<NumericField
						id={`rate-${width}`}
						label="Taxa"
						onValueChange={() => {}}
						placeholder="Ex: 4,5%"
						suffix="%"
						value="4.5"
					/>
				</div>
			))}
			<FormFieldRow>
				<MoneyField id="expense" label="Despesa" onValueChange={() => {}} value="100000" />
				<MoneyField id="refund" label="Estorno" onValueChange={() => {}} value="-100000" />
			</FormFieldRow>
			<DashboardPeriodFlowCard
				expenses={100000}
				income={100000}
				net={-100000}
				recurringExpenses={99999.99}
				recurringIncome={99999.99}
			/>
			<DashboardProjectedCashFlowCard expenses={100000} income={100000} net={-100000} />
		</main>
	);
}

createRoot(document.getElementById("root")!).render(<MoneySizingFixture />);
