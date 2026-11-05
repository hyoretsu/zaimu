import { formatAsset } from "@zaimu/finance/asset-amount";
import { roundMoney } from "@zaimu/finance/money";
import { LuTrash2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { AssetAmountField } from "@/components/ui/AssetAmountField";
import { AutoCollapseSection } from "@/components/ui/AutoCollapseSection";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { FormField } from "@/components/ui/FormField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { FinancialFee } from "@/lib/api";
import { CurrencySelect } from "./CurrencySelect";

const presets = ["IOF", "Spread", "Imposto", "Tarifa", "Juros", "Multa"];
export function FinancialFeeRow({
	fee: storedFee,
	baseAmount,
	onChange,
	onRemove,
	currencyCode,
	index,
}: {
	fee: FinancialFee;
	baseAmount: number | string;
	onChange: (fee: FinancialFee) => void;
	onRemove: () => void;
	currencyCode: string;
	index: number;
}) {
	const fee: FinancialFee = {
		...storedFee,
		amount:
			storedFee.type === "PERCENTAGE"
				? roundMoney((Number(baseAmount) * Number(storedFee.amount)) / 100, currencyCode)
				: storedFee.amount,
		type: "FIXED",
	};
	const [name, setName] = useDebouncedInput(fee.name, name => onChange({ ...fee, name }));
	return (
		<AutoCollapseSection
			complete={Boolean(name.trim()) && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(fee.amount))}
			summary={`${name} - ${formatAsset(fee.amount, fee.assetCode ?? currencyCode)}`}
			title="Taxa"
		>
			<CustomSelect
				label="Nome da taxa"
				onValueChange={name => onChange({ ...fee, name: name === "CUSTOM" ? "" : name })}
				options={[
					{ label: "Escrever outro nome", special: true, value: "CUSTOM" },
					...presets.map(value => ({ label: value, value })),
				]}
				placeholder="Ex: IOF"
				value={presets.includes(fee.name) ? fee.name : "CUSTOM"}
			/>
			{!presets.includes(fee.name) ? (
				<FormField
					id={`fee-name-${index}`}
					label="Nome personalizado"
					name={`fee-name-${index}`}
					onChange={event => setName(event.currentTarget.value)}
					placeholder="Ex: Taxa de serviço"
					required
					type="text"
					value={name}
				/>
			) : null}
			<CurrencySelect
				allowCrypto
				label="Ativo da taxa"
				onValueChange={assetCode => onChange({ ...fee, assetCode })}
				value={fee.assetCode ?? currencyCode}
			/>
			<AssetAmountField
				assetCode={fee.assetCode ?? currencyCode}
				id={`fee-amount-${index}`}
				label="Valor da taxa"
				onValueChange={amount => onChange({ ...fee, amount })}
				value={String(fee.amount || "")}
			/>
			<ActionGroup>
				<Button
					aria-label="Remover taxa"
					onClick={onRemove}
					size="icon"
					type="button"
					variant="outline"
				>
					<LuTrash2 />
				</Button>
			</ActionGroup>
		</AutoCollapseSection>
	);
}
