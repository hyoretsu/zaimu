import { useEffect, useState } from "react";
import { LuBadgeDollarSign } from "react-icons/lu";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";

export function CreditPurchaseFeeFields({
	amountDisabled = false,
	feeAmount,
	feeDescription,
	onFeeAmountChange,
	onFeeDescriptionChange,
}: {
	amountDisabled?: boolean;
	feeAmount: string;
	feeDescription: string;
	onFeeAmountChange: (value: string) => void;
	onFeeDescriptionChange: (value: string) => void;
}) {
	const [hasFee, setHasFee] = useState(Number(feeAmount) > 0);
	const [localFeeDescription, setLocalFeeDescription] = useDebouncedInput(
		feeDescription,
		onFeeDescriptionChange,
	);

	useEffect(() => {
		setHasFee(Number(feeAmount) > 0);
	}, [feeAmount]);

	return (
		<div className="grid gap-3 rounded-2xl border p-3">
			<CheckboxField
				checkboxProps={{
					checked: hasFee,
					disabled: amountDisabled,
					id: "purchase-has-fee",
					onCheckedChange: checked => {
						const nextHasFee = checked === true;
						setHasFee(nextHasFee);
						if (!nextHasFee) {
							onFeeAmountChange("");
							onFeeDescriptionChange("");
						}
					},
				}}
			>
				<span className="flex items-center gap-2">
					<LuBadgeDollarSign className="size-4" /> Adicionar taxa
				</span>
			</CheckboxField>
			{hasFee ? (
				<div className="grid gap-4 sm:grid-cols-2">
					<FormField
						autoComplete="off"
						id="purchase-fee-description"
						label="Nome da taxa"
						name="purchase-fee-description"
						onChange={event => setLocalFeeDescription(event.currentTarget.value)}
						placeholder="Ex: IOF"
						required
						type="text"
						value={localFeeDescription}
					/>
					<MoneyField
						disabled={amountDisabled}
						id="purchase-fee-amount"
						label="Valor da taxa"
						onValueChange={onFeeAmountChange}
						placeholder="R$ 6,38"
						required
						value={feeAmount}
					/>
				</div>
			) : null}
		</div>
	);
}
