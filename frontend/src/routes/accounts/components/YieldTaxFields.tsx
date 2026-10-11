import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { NumericField } from "@/components/ui/NumericField";
import { cachedTaxCatalog, fetchTaxCatalog } from "@/lib/tax-catalog";
export function YieldTaxFields({
	id,
	taxIds,
	taxRate,
	onTaxIdsChange,
	onTaxRateChange,
}: {
	id: string;
	taxIds: string[];
	taxRate: string;
	onTaxIdsChange: (ids: string[]) => void;
	onTaxRateChange: (rate: string) => void;
}) {
	const catalog = useQuery({
		initialData: cachedTaxCatalog,
		queryFn: fetchTaxCatalog,
		queryKey: ["tax-definitions"],
		staleTime: 60000,
	});
	const [fixed, setFixed] = useState(Boolean(taxRate));
	const definitions = catalog.data;
	const values = [...taxIds, ...(fixed ? ["fixed"] : [])];
	return (
		<div className="grid min-w-0 gap-3">
			<CustomSelect
				label="Impostos sobre rendimento"
				onValueChange={value => {
					if (value === "fixed") {
						setFixed(!fixed);
						if (fixed) onTaxRateChange("");
					} else
						onTaxIdsChange(taxIds.includes(value) ? taxIds.filter(id => id !== value) : [...taxIds, value]);
				}}
				options={[
					{ label: "Fixa", special: true, value: "fixed" },
					...definitions
						.filter(tax => tax.isActive || taxIds.includes(tax.id))
						.map(tax => ({ label: tax.name, value: tax.id })),
				]}
				placeholder="Sem imposto - pesquise para adicionar"
				searchable
				values={values}
			/>
			{fixed && (
				<NumericField
					decimalScale={2}
					id={id}
					label="Alíquota fixa"
					onValueChange={onTaxRateChange}
					placeholder="Ex: 15%"
					suffix="%"
					value={taxRate}
				/>
			)}
			<p className="text-muted-foreground text-xs">
				Desconto diário sobre lucro de cada aporte. IOF antes do IR; alíquota fixa por último.
			</p>
			{definitions
				.filter(tax => taxIds.includes(tax.id))
				.map(tax => (
					<details className="rounded-xl border p-3 text-xs" key={tax.id}>
						<summary className="cursor-pointer font-medium">{tax.name}</summary>
						<div className="grid gap-1 pt-2">
							{tax.versions.at(-1)?.brackets.map((bracket, index, brackets) => (
								<p key={index}>
									{index === 0 ? "Desde depósito" : `Após ${brackets[index - 1]?.upToDays} dias`}
									{bracket.upToDays === null ? "" : ` até ${bracket.upToDays} dias`}:{" "}
									{bracket.rate.toLocaleString("pt-BR")}%
								</p>
							))}
						</div>
					</details>
				))}
		</div>
	);
}
