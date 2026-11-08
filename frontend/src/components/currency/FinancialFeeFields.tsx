import { formatAsset } from "@zaimu/finance/asset-amount";
import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CollapsibleFormSection } from "@/components/ui/CollapsibleFormSection";
import type { FinancialFee } from "@/lib/api";
import { showToast } from "@/stores";
import { FinancialFeeRow } from "./FinancialFeeRow";

export function FinancialFeeFields({
	fees,
	baseAmount,
	description,
	disabled = false,
	maxItems,
	onChange,
	currencyCode = "BRL",
	selectableAsset = false,
}: {
	fees: FinancialFee[];
	baseAmount: number | string;
	description?: string;
	disabled?: boolean;
	maxItems?: number;
	onChange: (fees: FinancialFee[]) => void;
	currencyCode?: string;
	selectableAsset?: boolean;
}) {
	return (
		<CollapsibleFormSection
			defaultExpanded={fees.length > 0}
			summary={
				fees.length
					? fees
							.map(
								fee =>
									`${fee.name} - ${formatAsset(fee.amount, fee.assetCode ?? currencyCode)}`,
							)
							.join(", ")
					: "Nenhuma taxa"
			}
			title="Taxas"
		>
			<fieldset className="grid min-w-0 gap-3" disabled={disabled}>
				{description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
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
						selectableAsset={selectableAsset}
					/>
				))}
				<ActionGroup>
					<Button
						disabled={maxItems !== undefined && fees.length >= maxItems}
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
			</fieldset>
		</CollapsibleFormSection>
	);
}
