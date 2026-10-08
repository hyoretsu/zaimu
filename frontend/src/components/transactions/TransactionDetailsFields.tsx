import { CurrencySelect, FinancialFeeFields } from "@/components/currency";
import { StorePicker } from "@/components/stores";
import { TagPicker } from "@/components/tags";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { TimeField } from "@/components/ui/TimeField";
import type { FinancialFee, Transaction } from "@/lib/api";
import { TransactionConversionPreview } from "./TransactionConversionPreview";

type TransactionFormType = Transaction["type"] | "YIELD";

export function TransactionDetailsFields({
	amount,
	paymentCurrency,
	paymentAmount = "",
	onPaymentAmountChange,
	currencyCode = "BRL",
	bookingCurrency = currencyCode,
	onCurrencyChange,
	fees = [],
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
	paymentCurrency?: string;
	paymentAmount?: string;
	onPaymentAmountChange?: (value: string) => void;
	currencyCode?: string;
	bookingCurrency?: string;
	onCurrencyChange?: (value: string) => void;
	fees?: FinancialFee[];
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
			{onCurrencyChange ? (
				<CurrencySelect label="Moeda da transação" onValueChange={onCurrencyChange} value={currencyCode} />
			) : null}
			<MoneyField
				currencyCode={currencyCode}
				id="transaction-amount"
				label="Valor"
				onValueChange={onAmountChange}
				required
				value={amount}
			/>
			{paymentCurrency && onPaymentAmountChange && (
				<div className="space-y-2">
					<MoneyField
						currencyCode={paymentCurrency}
						id="transaction-payment-amount"
						label="Valor creditado na fatura"
						onValueChange={onPaymentAmountChange}
						value={paymentAmount}
					/>
					<p className="text-muted-foreground text-xs">
						Opcional. Informe valor efetivo ou deixe conversão automática.
					</p>
					<TransactionConversionPreview
						amount={amount}
						bookingCurrency={bookingCurrency}
						date={date}
						fees={fees}
						onUse={onPaymentAmountChange}
						sourceCurrency={currencyCode}
						targetCurrency={paymentCurrency}
					/>
				</div>
			)}
			{onFeesChange ? (
				<FinancialFeeFields
					baseAmount={Number(amount) || 0}
					currencyCode={currencyCode}
					fees={fees}
					onChange={onFeesChange}
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
			<div className="grid gap-4 sm:grid-cols-2">
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
			</div>
			{onIsHiddenChange ? (
				<CheckboxField
					align="start"
					checkboxProps={{
						checked: isHidden,
						id: "transaction-is-hidden",
						onCheckedChange: checked => onIsHiddenChange(checked === true),
					}}
				>
					<span className="font-medium text-foreground-muted">Ocultar na lista do dia</span>
				</CheckboxField>
			) : null}
			{showTags ? <TagPicker onValueChange={onTagIdsChange} value={tagIds} /> : null}
		</>
	);
}
