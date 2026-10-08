import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import type { FinancialFee } from "@/lib/api";
import { showToast } from "@/stores";
import { FinancialFeeRow } from "./FinancialFeeRow";

export function FinancialFeeFields({
	fees,
	baseAmount,
	onChange,
	currencyCode = "BRL",
}: {
	fees: FinancialFee[];
	baseAmount: number;
	onChange: (fees: FinancialFee[]) => void;
	currencyCode?: string;
}) {
	return (
		<div className="grid min-w-0 grid-cols-1 gap-3">
			{fees.map((fee, index) => (
				<FinancialFeeRow
					baseAmount={baseAmount}
					currencyCode={currencyCode}
					fee={fee}
					index={index}
					key={index}
					onChange={updated =>
						onChange(fees.map((value, position) => (position === index ? updated : value)))
					}
					onRemove={() => {
						onChange(fees.filter((_, position) => position !== index));
						showToast("Taxa removida.", "info");
					}}
				/>
			))}
			<ActionGroup>
				<Button
					onClick={() => {
						onChange([...fees, { amount: 0, name: "IOF", type: "FIXED" }]);
						showToast("Taxa adicionada.", "info");
					}}
					type="button"
					variant="outline"
				>
					<LuPlus /> Adicionar taxa
				</Button>
			</ActionGroup>
		</div>
	);
}
