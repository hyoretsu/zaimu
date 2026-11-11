import { LuX } from "react-icons/lu";
import { CurrencySelect } from "@/components/currency";
import { Button } from "@/components/ui/Button";
import { CollapsibleFormSection } from "@/components/ui/CollapsibleFormSection";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { countryCodes, countryName } from "@/lib/countries";
import type { InstitutionFormState } from "./types";

export function CountriesSection({
	disabled,
	onChange,
	state,
}: {
	disabled: boolean;
	onChange: (patch: Partial<InstitutionFormState>) => void;
	state: InstitutionFormState;
}) {
	const currencySummary = state.currency ? ` - moeda ${state.currency}` : "";
	return (
		<CollapsibleFormSection
			summary={
				state.countries.length
					? `${state.countries.map(code => countryName(code)).join("; ")} - moeda ${state.currency}`
					: `Nenhum país configurado - moeda ${state.currency}`
			}
			title="Países de operação"
		>
			<CustomSelect
				disabled={disabled}
				label="Adicionar país de operação"
				onValueChange={code => onChange({ countries: [...state.countries, code] })}
				options={countryCodes
					.filter(code => !state.countries.includes(code))
					.map(code => ({ label: countryName(code), value: code }))}
				placeholder="Ex: Brasil"
				searchable
			/>
			{state.countries.length === 0 ? (
				<p className="text-muted-foreground text-sm">Nenhum país configurado.</p>
			) : (
				<ul className="grid gap-2">
					{state.countries.map(code => (
						<li className="flex items-center gap-3 rounded-xl border p-3" key={code}>
							<span className="min-w-0 flex-1 font-medium">{countryName(code)}</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										aria-label={`Remover ${countryName(code)}`}
										disabled={disabled}
										onClick={() =>
											onChange({
												countries: state.countries.filter(item => item !== code),
											})
										}
										size="icon-sm"
										type="button"
										variant="outline"
									>
										<LuX />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Remover país</TooltipContent>
							</Tooltip>
						</li>
					))}
				</ul>
			)}
			<CurrencySelect
				disabled={disabled}
				label="Moeda da instituição"
				onValueChange={currency => onChange({ currency })}
				value={state.currency}
			/>
		</CollapsibleFormSection>
	);
}
