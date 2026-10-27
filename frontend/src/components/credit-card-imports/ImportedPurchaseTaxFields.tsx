import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/stores";
import { ImportedPurchaseTaxRow } from "./ImportedPurchaseTaxRow";

export function ImportedPurchaseTaxFields({
	taxes,
	onChange,
	currencyCode,
}: {
	taxes: { name: string; amount: number }[];
	onChange: (taxes: { name: string; amount: number }[]) => void;
	currencyCode: string;
}) {
	return (
		<section className="grid min-w-0 gap-3">
			<div>
				<h3 className="text-sm font-medium">Impostos da compra</h3>
				<p className="text-muted-foreground text-xs">
					Valores já incluídos no valor total da compra.
				</p>
			</div>
			{taxes.map((tax, index) => (
				<ImportedPurchaseTaxRow
					currencyCode={currencyCode}
					index={index}
					key={index}
					onChange={updated =>
						onChange(taxes.map((value, position) => (position === index ? updated : value)))
					}
					onRemove={() => {
						onChange(taxes.filter((_, position) => position !== index));
						showToast("Imposto removido.", "info");
					}}
					tax={tax}
				/>
			))}
			<ActionGroup>
				<Button
					disabled={taxes.length >= 20}
					onClick={() => {
						onChange([...taxes, { amount: 0, name: "IOF" }]);
						showToast("Imposto adicionado.", "info");
					}}
					variant="outline"
				>
					<LuPlus />
					Adicionar imposto
				</Button>
			</ActionGroup>
		</section>
	);
}
