import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { fixedTaxKey, type YieldTaxMode } from "@zaimu/finance/yield-tax";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { NumericField } from "@/components/ui/NumericField";
import { cachedTaxCatalog, fetchTaxCatalog } from "@/lib/tax-catalog";

const modeOptions: { label: string; value: YieldTaxMode }[] = [
	{ label: "Diariamente (saldo líquido)", value: "DAILY" },
	{ label: "Apenas no resgate (saldo bruto)", value: "ON_REDEMPTION" },
];
const modeHints: Record<YieldTaxMode, string> = {
	DAILY: "Desconto diário sobre o lucro de cada aporte.",
	ON_REDEMPTION:
		"O saldo é bruto e o imposto incide sobre o lucro de cada aporte apenas no resgate; o saldo líquido é exibido à parte.",
};

export function YieldTaxFields({
	id,
	taxIds,
	taxModes,
	taxRate,
	onTaxIdsChange,
	onTaxModesChange,
	onTaxRateChange,
}: {
	id: string;
	taxIds: string[];
	taxModes: Record<string, YieldTaxMode>;
	taxRate: string;
	onTaxIdsChange: (ids: string[]) => void;
	onTaxModesChange: (modes: Record<string, YieldTaxMode>) => void;
	onTaxRateChange: (rate: string) => void;
}) {
	const catalog = useQuery({
		initialData: cachedTaxCatalog,
		queryFn: fetchTaxCatalog,
		queryKey: ["tax-definitions"],
		staleTime: 60000,
	});
	const [fixed, setFixed] = useState(Boolean(taxRate));
	const [infoTaxId, setInfoTaxId] = useState<string | null>(null);
	const definitions = catalog.data;
	const values = [...taxIds, ...(fixed ? [fixedTaxKey] : [])];
	const infoTax = definitions.find(tax => tax.id === infoTaxId);
	const modeOf = (key: string) => taxModes[key] ?? "DAILY";
	const setMode = (key: string, mode: YieldTaxMode) => onTaxModesChange({ ...taxModes, [key]: mode });
	const rows = [
		...definitions.filter(tax => taxIds.includes(tax.id)).map(tax => ({ key: tax.id, name: tax.name })),
		...(fixed ? [{ key: fixedTaxKey, name: "Fixa" }] : []),
	];
	return (
		<div className="grid min-w-0 gap-3">
			<CustomSelect
				label="Impostos sobre rendimento"
				onValueChange={value => {
					if (value === fixedTaxKey) {
						setFixed(!fixed);
						if (fixed) onTaxRateChange("");
					} else
						onTaxIdsChange(
							taxIds.includes(value) ? taxIds.filter(id => id !== value) : [...taxIds, value],
						);
				}}
				options={[
					{ label: "Fixa", special: true, value: fixedTaxKey },
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
			{rows.map(row => (
				<div className="grid min-w-0 gap-1" key={row.key}>
					<div className="flex items-end gap-2">
						<div className="min-w-0 flex-1">
							<CustomSelect
								label={`Aplicação do imposto — ${row.name}`}
								onValueChange={value => setMode(row.key, value as YieldTaxMode)}
								options={modeOptions}
								placeholder="Selecione"
								sortOptions={false}
								value={modeOf(row.key)}
							/>
						</div>
						{row.key !== fixedTaxKey && (
							<Button
								aria-label={`Detalhes de ${row.name}`}
								onClick={() => setInfoTaxId(row.key)}
								size="icon"
								type="button"
								variant="outline"
							>
								<HugeiconsIcon icon={InformationCircleIcon} />
							</Button>
						)}
					</div>
					<p className="text-muted-foreground text-xs">{modeHints[modeOf(row.key)]}</p>
				</div>
			))}
			{rows.length > 0 && (
				<p className="text-muted-foreground text-xs">IOF antes do IR; alíquota fixa por último.</p>
			)}
			<Dialog onOpenChange={open => !open && setInfoTaxId(null)} open={Boolean(infoTax)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{infoTax?.name}</DialogTitle>
						<DialogDescription>Alíquotas conforme o tempo desde o aporte.</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<div className="grid gap-1 text-sm">
							{infoTax?.versions.at(-1)?.brackets.map((bracket, index, brackets) => (
								<p key={index}>
									{index === 0
										? "Desde depósito"
										: `Após ${brackets[index - 1]?.upToDays} dias`}
									{bracket.upToDays === null ? "" : ` até ${bracket.upToDays} dias`}:{" "}
									{bracket.rate.toLocaleString("pt-BR")}%
								</p>
							))}
						</div>
					</DialogBody>
				</DialogContent>
			</Dialog>
		</div>
	);
}
