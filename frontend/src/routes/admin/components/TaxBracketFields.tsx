import type { TaxBracket } from "@zaimu/finance/yield-tax";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { NumericField } from "@/components/ui/NumericField";
export function TaxBracketFields({
	bracket,
	index,
	last,
	onChange,
}: {
	bracket: TaxBracket;
	index: number;
	last: boolean;
	onChange: (value: TaxBracket) => void;
}) {
	return (
		<FormFieldRow>
			{last ? (
				<div className="grid gap-2">
					<p className="font-medium text-sm">Prazo</p>
					<p className="text-muted-foreground text-sm">Acima da faixa anterior</p>
				</div>
			) : (
				<NumericField
					decimalScale={0}
					id={`tax-days-${index}`}
					label="Até quantos dias"
					onValueChange={value => onChange({ ...bracket, upToDays: value === "" ? -1 : Number(value) })}
					placeholder="Ex: 180"
					required
					value={String(bracket.upToDays ?? "")}
				/>
			)}
			<NumericField
				decimalScale={2}
				id={`tax-rate-${index}`}
				label="Alíquota"
				onValueChange={value => onChange({ ...bracket, rate: value === "" ? Number.NaN : Number(value) })}
				placeholder="Ex: 22,5%"
				required
				suffix="%"
				value={Number.isFinite(bracket.rate) ? String(bracket.rate) : ""}
			/>
		</FormFieldRow>
	);
}
