import { roundMoney } from "@zaimu/finance/money";
import { LuTrash2 } from "react-icons/lu";
import { AssetAmountField } from "@/components/ui/AssetAmountField";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { FinancialFee } from "@/lib/api";
import { CurrencySelect } from "./CurrencySelect";

export function FinancialFeeRow({
	fee: storedFee,
	baseAmount,
	onChange,
	onRemove,
	currencyCode,
	index,
	selectableAsset = false,
}: {
	fee: FinancialFee;
	baseAmount: number | string;
	onChange: (fee: FinancialFee) => void;
	onRemove: () => void;
	currencyCode: string;
	index: number;
	selectableAsset?: boolean;
}) {
	const fee: FinancialFee = {
		...storedFee,
		amount:
			storedFee.type === "PERCENTAGE"
				? roundMoney((Number(baseAmount) * Number(storedFee.amount)) / 100, currencyCode)
				: storedFee.amount,
		type: "FIXED",
	};
	const assetCode = fee.assetCode ?? currencyCode;
	const [name, setName] = useDebouncedInput(fee.name, name => onChange({ ...fee, name }));
	return (
		<div className="grid min-w-0 gap-3">
			<FormFieldRow className="grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-2 has-[[data-slot=money-field]]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
				<FormField
					id={`fee-name-${index}`}
					label="Taxa"
					maxLength={100}
					name={`fee-name-${index}`}
					onChange={event => setName(event.currentTarget.value)}
					placeholder="Ex: IOF"
					required
					type="text"
					value={name}
				/>
				<AssetAmountField
					assetCode={assetCode}
					id={`fee-amount-${index}`}
					label="Valor"
					onValueChange={amount => onChange({ ...fee, amount: Number(amount), name })}
					rawValueName={`fee-raw-${index}`}
					required
					value={String(fee.amount)}
				/>
				<div>
					<Button
						aria-label="Remover taxa"
						className="row-start-2"
						onClick={onRemove}
						size="icon"
						type="button"
						variant="outline"
					>
						<LuTrash2 />
					</Button>
				</div>
			</FormFieldRow>
			{selectableAsset ? (
				<CurrencySelect
					allowCrypto
					label="Ativo da taxa"
					onValueChange={assetCode => onChange({ ...fee, assetCode })}
					value={assetCode}
				/>
			) : null}
		</div>
	);
}
