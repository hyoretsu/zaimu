import type { TaxBracket } from "@zaimu/finance/yield-tax";
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
		<div className="grid min-w-0 grid-cols-2 items-center gap-4">
			{last ? (
				<p className="min-w-0 text-muted-foreground text-sm">Acima da faixa anterior</p>
			) : (
				<NumericField
					decimalScale={0}
					hideLabel
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
				hideLabel
				id={`tax-rate-${index}`}
				label="Alíquota"
				onValueChange={value => onChange({ ...bracket, rate: value === "" ? Number.NaN : Number(value) })}
				placeholder="Ex: 22,5%"
				required
				suffix="%"
				value={Number.isFinite(bracket.rate) ? String(bracket.rate) : ""}
			/>
		</div>
	);
}
