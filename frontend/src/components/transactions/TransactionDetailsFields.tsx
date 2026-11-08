import { isCryptoAsset } from "@zaimu/finance/money";
import { CurrencySelect, FinancialFeeFields } from "@/components/currency";
import { StorePicker } from "@/components/stores";
import { TagPicker } from "@/components/tags";
import { AssetAmountField } from "@/components/ui/AssetAmountField";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { FormField } from "@/components/ui/FormField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { TimeField } from "@/components/ui/TimeField";
import type { FinancialFee, Transaction } from "@/lib/api";
import { TransactionConversionPreview } from "./TransactionConversionPreview";

type TransactionFormType = Transaction["type"] | "YIELD";

/** Principal of a debit that already includes its fees; fees paid in another asset are separate debits. */
function principalWithoutFees(amount: string, fees: FinancialFee[], currencyCode: string) {
	const total = Number(amount);
	const feeTotal = fees.reduce((sum, fee) => {
		if (fee.assetCode && fee.assetCode !== currencyCode) return sum;
		return (
			sum + (fee.type === "PERCENTAGE" ? (total * Number(fee.amount)) / 100 : Number(fee.amount) || 0)
		);
	}, 0);
	return String(Math.max(0, total - feeTotal));
}

export function TransactionDetailsFields({
	amount,
	amountIsPoints = false,
	counterpart = null,
	counterpartCurrency,
	counterpartIsPoints = false,
	counterpartValue = "",
	onCounterpartChange,
	onDestinationCurrencyChange,
	onDestinationAmountChange,
	destinationAmount = "",
	paymentCurrency,
	paymentAmount = "",
	onPaymentAmountChange,
	currencyCode = "BRL",
	bookingCurrency = currencyCode,
	onCurrencyChange,
	fees = [],
	feesIncludedInAmount = false,
	onFeesChange,
	date,
	description,
	onAmountChange,
	onDateChange,
	onIsHiddenChange,
	onTimeChange,
	onDescriptionChange,
	onStoreNameChange,
	onTagIdsChange,
	onTypeChange,
	showDescription = true,
	showTags = true,
	showStore = false,
	storeName,
	isHidden = false,
	includeYield = false,
	showType = true,
	tagIds,
	time,
	type,
}: {
	amount: string;
	amountIsPoints?: boolean;
	counterpart?: "destination" | "payment" | null;
	counterpartCurrency?: string;
	counterpartIsPoints?: boolean;
	counterpartValue?: string;
	onDestinationCurrencyChange?: (value: string) => void;
	onDestinationAmountChange?: (value: string) => void;
	destinationAmount?: string;
	onCounterpartChange?: (value: string) => void;
	paymentCurrency?: string;
	paymentAmount?: string;
	onPaymentAmountChange?: (value: string) => void;
	currencyCode?: string;
	bookingCurrency?: string;
	onCurrencyChange?: (value: string) => void;
	fees?: FinancialFee[];
	/** The amount already contains the fees (e.g. a bank statement debit), so the received-amount suggestion must not add them again. */
	feesIncludedInAmount?: boolean;
	onFeesChange?: (value: FinancialFee[]) => void;
	date: string;
	description: string;
	onAmountChange: (amount: string) => void;
	onDateChange: (date: string) => void;
	onIsHiddenChange?: (isHidden: boolean) => void;
	onTimeChange: (time: string) => void;
	onDescriptionChange: (description: string) => void;
	onStoreNameChange: (storeName: string) => void;
	onTagIdsChange: (tagIds: string[]) => void;
	onTypeChange: (type: TransactionFormType) => void;
	showDescription?: boolean;
	showTags?: boolean;
	showStore?: boolean;
	storeName: string;
	isHidden?: boolean;
	includeYield?: boolean;
	showType?: boolean;
	tagIds: string[];
	time: string;
	type: TransactionFormType;
}) {
	return (
		<>
			{showType ? (
				<CustomSelect
					label="Tipo"
					onValueChange={value => onTypeChange(value as TransactionFormType)}
					options={[
						{ label: "Saída", value: "EXPENSE" },
						{ label: "Entrada", value: "INCOME" },
						...(includeYield ? [{ label: "Rendimento", value: "YIELD" }] : []),
						{ label: "Transferência", value: "TRANSFER" },
					]}
					placeholder="Selecione o tipo"
					required
					value={type}
				/>
			) : null}
			<FormFieldRow className="max-sm:grid-cols-1">
				{onCurrencyChange ? (
					<CurrencySelect
						allowCrypto={type !== "YIELD"}
						label="Ativo da transação"
						onValueChange={onCurrencyChange}
						value={currencyCode}
					/>
				) : null}
				{amountIsPoints ? (
					<NumericField
						id="transaction-amount"
						label="Pontos gastos"
						onValueChange={onAmountChange}
						placeholder="Ex: 10.000"
						required
						value={amount}
					/>
				) : (
					<AssetAmountField
						assetCode={currencyCode}
						id="transaction-amount"
						label="Valor"
						onValueChange={onAmountChange}
						required
						value={amount}
					/>
				)}
			</FormFieldRow>
			{onDestinationCurrencyChange && !counterpartIsPoints && (
				<CurrencySelect
					allowCrypto
					label="Ativo de destino"
					onValueChange={onDestinationCurrencyChange}
					value={counterpartCurrency ?? currencyCode}
				/>
			)}
			{!counterpart && onDestinationAmountChange && counterpartCurrency !== currencyCode && (
				<div className="space-y-2">
					<AssetAmountField
						assetCode={counterpartCurrency ?? currencyCode}
						id="transaction-destination-amount"
						label="Valor recebido"
						onValueChange={onDestinationAmountChange}
						required
						value={destinationAmount}
					/>
					{!isCryptoAsset(currencyCode) && !isCryptoAsset(counterpartCurrency ?? currencyCode) && (
						<TransactionConversionPreview
							amount={
								feesIncludedInAmount
									? principalWithoutFees(amount, fees, currencyCode)
									: amount
							}
							bookingCurrency={bookingCurrency}
							date={date}
							fees={feesIncludedInAmount ? [] : fees}
							onUse={onDestinationAmountChange}
							sourceCurrency={currencyCode}
							targetCurrency={counterpartCurrency ?? currencyCode}
						/>
					)}
				</div>
			)}
			{counterpart && onCounterpartChange ? (
				counterpartIsPoints ? (
					<NumericField
						id="transaction-counterpart-amount"
						label="Pontos recebidos"
						onValueChange={onCounterpartChange}
						placeholder="Ex: 10.000"
						required
						value={counterpartValue}
					/>
				) : (
					<AssetAmountField
						assetCode={counterpartCurrency ?? currencyCode}
						id="transaction-counterpart-amount"
						label={counterpart === "payment" ? "Valor creditado na fatura" : "Valor recebido"}
						onValueChange={onCounterpartChange}
						required
						value={counterpartValue}
					/>
				)
			) : null}
			{!counterpart &&
				paymentCurrency &&
				(currencyCode !== paymentCurrency || bookingCurrency !== paymentCurrency) &&
				onPaymentAmountChange && (
					<div className="space-y-2">
						<MoneyField
							currencyCode={paymentCurrency}
							id="transaction-payment-amount"
							label="Valor creditado na fatura"
							onValueChange={onPaymentAmountChange}
							required={isCryptoAsset(currencyCode)}
							value={paymentAmount}
						/>
						<p className="text-muted-foreground text-xs">
							Informe valor efetivo ou deixe conversão automática.
						</p>
						{!isCryptoAsset(currencyCode) && (
							<TransactionConversionPreview
								amount={amount}
								bookingCurrency={bookingCurrency}
								date={date}
								fees={fees}
								onUse={onPaymentAmountChange}
								sourceCurrency={currencyCode}
								targetCurrency={paymentCurrency}
							/>
						)}
					</div>
				)}
			{onFeesChange ? (
				<FinancialFeeFields
					baseAmount={amount || "0"}
					currencyCode={currencyCode}
					fees={fees}
					onChange={onFeesChange}
					selectableAsset
				/>
			) : null}
			{showDescription ? (
				<FormField
					autoComplete="off"
					id="transaction-description"
					label="Descrição"
					name="description"
					onChange={event => onDescriptionChange(event.currentTarget.value)}
					placeholder="Ex: Mercado do mês"
					type="text"
					value={description}
				/>
			) : null}
			{showStore ? <StorePicker onValueChange={onStoreNameChange} value={storeName} /> : null}
			<FormFieldRow>
				<DateField
					id="transaction-date"
					label="Data"
					name="date"
					onValueChange={onDateChange}
					required
					value={date}
				/>
				<TimeField
					id="transaction-time"
					label="Horário"
					name="time"
					onValueChange={onTimeChange}
					placeholder="Ex: 14:30"
					value={time}
				/>
			</FormFieldRow>
			{onIsHiddenChange ? (
				<CheckboxField
					align="start"
					checkboxProps={{
						checked: isHidden,
						id: "transaction-is-hidden",
						onCheckedChange: checked => onIsHiddenChange(checked === true),
					}}
				>
					<span className="text-foreground-muted font-medium">Ocultar na lista do dia</span>
				</CheckboxField>
			) : null}
			{showTags ? <TagPicker onValueChange={onTagIdsChange} value={tagIds} /> : null}
		</>
	);
}
