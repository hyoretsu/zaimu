import { withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { useEffect, useRef, useState } from "react";
import { DebtSplitEditor } from "@/components/debts";
import { ImportDialog, ImportDialogContent } from "@/components/imports";
import { StorePicker } from "@/components/stores";
import { TagPicker } from "@/components/tags";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { DateField } from "@/components/ui/DateField";
import {
	DialogBody,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { TimeField } from "@/components/ui/TimeField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { CreditCardImportItem } from "@/lib/api";
import type { dataService } from "@/lib/dataService";
import { calculateDebtSplit, debtSplitToInput } from "@/lib/debt-split";
import { cleanFinancedDescription, getFinancedOperation } from "@/lib/financing-source-reference";
import { showToast } from "@/stores";
import { ImportedPurchaseTaxFields } from "./ImportedPurchaseTaxFields";
import { ImportedTaxPurchaseSelect } from "./ImportedTaxPurchaseSelect";

export function EditImportedCreditPurchaseDialog({
	currencyCode,
	importId,
	initialData,
	item,
	onOpenChange,
	onSubmit,
	open,
	pending,
}: {
	currencyCode: string;
	importId: string;
	initialData?: Parameters<typeof dataService.creditCardImports.updateItem>[2];
	item: CreditCardImportItem | null;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: Parameters<typeof dataService.creditCardImports.updateItem>[2]) => void;
	open: boolean;
	pending: boolean;
}) {
	const [description, setDescription] = useDebouncedInput("", () => undefined);
	const [installments, setInstallments] = useDebouncedInput("1", () => undefined);
	const [debtSplit, setDebtSplit] = useState(() => debtSplitToInput());
	const fieldsRef = useRef<HTMLDivElement>(null);
	const [taxes, setTaxes] = useState<{ name: string; amount: number }[]>([]);
	const [taxPurchaseItemId, setTaxPurchaseItemId] = useState("");
	const [isStatementCharge, setIsStatementCharge] = useState(false);
	const [isDebt, setIsDebt] = useState(false);
	const [purchaseDate, setPurchaseDate] = useState("");
	const [storeName, setStoreName] = useState("");
	const [tagIds, setTagIds] = useState<string[]>([]);
	const [totalAmount, setTotalAmount] = useState("");
	const [time, setTime] = useState("");
	const [statementDate, setStatementDate] = useState("");
	const [dueDate, setDueDate] = useState("");
	useEffect(() => {
		if (!item || !open) return;
		setDescription(
			initialData?.description ??
				getFinancedOperation(item.description)?.merchant ??
				withoutImportedAnticipation(cleanFinancedDescription(item.description)),
		);
		setInstallments(String(initialData?.installments ?? item.installments));
		setDebtSplit(initialData?.debtSplit ?? debtSplitToInput(item.debtSplit));
		setIsDebt(
			!(initialData?.isStatementCharge ?? item.isStatementCharge) &&
				Boolean(initialData ? initialData.debtSplit : item.debtSplit),
		);
		setTaxes(initialData?.taxes ?? item.taxes ?? []);
		setTaxPurchaseItemId(initialData?.taxPurchaseItemId ?? "");
		setIsStatementCharge(initialData?.isStatementCharge ?? item.isStatementCharge ?? false);
		setPurchaseDate(initialData?.purchaseDate ?? item.purchaseDate);
		setStoreName(initialData?.storeName ?? item.storeName ?? "");
		setTagIds(initialData?.tagIds ?? item.tagIds);
		setTotalAmount(String(initialData?.totalAmount ?? item.totalAmount));
		setTime(initialData?.time ?? item.time ?? "");
		setStatementDate(initialData?.statementDate ?? "");
		setDueDate(initialData?.dueDate ?? "");
	}, [initialData, item, open, setDescription, setInstallments]);
	if (!item) return null;
	const installmentCount = isStatementCharge ? 1 : Number.parseInt(installments, 10);
	const isValid =
		(!item.metadataMissing?.includes("calendar") || Boolean(statementDate && dueDate)) &&
		Number.isFinite(Number(totalAmount)) &&
		Number(totalAmount) > 0 &&
		taxes.every(tax => tax.name.trim() && Number.isFinite(tax.amount) && tax.amount > 0) &&
		taxes.reduce((sum, tax) => sum + tax.amount, 0) <= Number(totalAmount) &&
		Number.isInteger(installmentCount) &&
		installmentCount >= 1 &&
		installmentCount <= 48 &&
		(!isDebt || Boolean(calculateDebtSplit(Number(totalAmount), debtSplit, currencyCode)));

	return (
		<ImportDialog onOpenChange={onOpenChange} open={open}>
			<ImportDialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Editar compra importada</DialogTitle>
					<DialogDescription>Alterações valem antes da criação das parcelas.</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div className="grid gap-5" ref={fieldsRef}>
						<FormField
							autoComplete="off"
							id="imported-purchase-description"
							label={getFinancedOperation(item.description) ? "Estabelecimento" : "Descrição"}
							name="imported-purchase-description"
							onChange={event => setDescription(event.currentTarget.value)}
							placeholder="Ex: Mercado Livre"
							type="text"
							value={description}
						/>
						<StorePicker onValueChange={setStoreName} value={storeName} />
						{item.metadataMissing?.length ? (
							<p className="text-destructive text-sm">
								Complete os campos obrigatórios para resolver os dados bancários incompletos.
							</p>
						) : null}
						{item.metadataMissing?.includes("calendar") && (
							<FormFieldRow className="grid-cols-1 sm:grid-cols-2">
								<DateField
									id="imported-statement-date"
									label="Fechamento da fatura"
									name="imported-statement-date"
									onValueChange={setStatementDate}
									required
									value={statementDate}
								/>
								<DateField
									id="imported-due-date"
									label="Vencimento da fatura"
									name="imported-due-date"
									onValueChange={setDueDate}
									required
									value={dueDate}
								/>
							</FormFieldRow>
						)}

						<MoneyField
							currencyCode={currencyCode}
							id="imported-purchase-total"
							label="Valor total"
							onValueChange={setTotalAmount}
							rawValueName="imported-purchase-raw-total"
							required
							value={totalAmount}
						/>
						<FormFieldRow className="grid-cols-1 sm:grid-cols-3">
							<FormField
								autoComplete="off"
								disabled={isStatementCharge}
								id="imported-purchase-installments"
								inputMode="numeric"
								label="Total de parcelas"
								name="imported-purchase-installments"
								onChange={event =>
									setInstallments(event.currentTarget.value.replace(/\D/g, "").slice(0, 2))
								}
								placeholder="Ex: 12"
								required
								type="text"
								value={isStatementCharge ? "1" : installments}
							/>
							<DateField
								autoComplete="off"
								id="imported-purchase-date"
								label="Data da primeira parcela"
								name="imported-purchase-date"
								onValueChange={setPurchaseDate}
								required
								value={purchaseDate}
							/>
							<TimeField
								id="imported-purchase-time"
								label="Horário"
								name="imported-purchase-time"
								onValueChange={setTime}
								placeholder="Ex: 14:30"
								value={time}
							/>
						</FormFieldRow>
						<TagPicker onValueChange={setTagIds} value={tagIds} />
						{!isStatementCharge && (
							<ImportedPurchaseTaxFields
								currencyCode={currencyCode}
								onChange={setTaxes}
								taxes={taxes}
							/>
						)}
						{item.installments === 1 && item.installmentAmount > 0 && !item.taxes?.length && (
							<ImportedTaxPurchaseSelect
								currencyCode={currencyCode}
								importId={importId}
								itemId={item.id}
								onChange={setTaxPurchaseItemId}
								value={taxPurchaseItemId}
							/>
						)}
						<CheckboxField
							checkboxProps={{
								checked: isStatementCharge,
								id: "imported-purchase-is-charge",
								onCheckedChange: checked => {
									setIsStatementCharge(checked === true);
									if (checked) setTaxes([]);
									if (checked) setIsDebt(false);
								},
							}}
						>
							Encargo da fatura (juros, multa ou tarifas)
						</CheckboxField>
						<div className="grid gap-3 rounded-2xl border p-3">
							<CheckboxField
								checkboxProps={{
									checked: isDebt,
									disabled: isStatementCharge,
									id: "imported-purchase-is-debt",
									onCheckedChange: checked => setIsDebt(checked === true),
								}}
							>
								<span>Esta compra é de uma dívida</span>
							</CheckboxField>
							{isDebt ? (
								<DebtSplitEditor
									amount={Number(totalAmount)}
									currencyCode={currencyCode}
									onChange={setDebtSplit}
									value={debtSplit}
								/>
							) : null}
						</div>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={!isValid || pending}
						onClick={() => {
							const submittedTaxes = taxes.map((tax, index) => ({
								amount: Number(
									fieldsRef.current?.querySelector<HTMLInputElement>(
										`input[name="import-tax-raw-${index}"]`,
									)?.value ?? tax.amount,
								),
								name:
									fieldsRef.current
										?.querySelector<HTMLInputElement>(
											`input[name="import-tax-name-${index}"]`,
										)
										?.value.trim() ?? tax.name,
							}));
							const submittedTotal = Number(
								fieldsRef.current?.querySelector<HTMLInputElement>(
									'input[name="imported-purchase-raw-total"]',
								)?.value ?? totalAmount,
							);
							if (
								!taxPurchaseItemId &&
								(!Number.isFinite(submittedTotal) ||
									submittedTotal <= 0 ||
									submittedTaxes.some(
										tax => !tax.name || !Number.isFinite(tax.amount) || tax.amount <= 0,
									) ||
									submittedTaxes.reduce((sum, tax) => sum + tax.amount, 0) > submittedTotal)
							) {
								showToast(
									"Informe impostos válidos já incluídos no total da compra.",
									"negative",
								);
								return;
							}
							onSubmit({
								taxes: isStatementCharge ? [] : submittedTaxes,
								...(taxPurchaseItemId ? { taxPurchaseItemId } : {}),
								debtSplit: isDebt && !isStatementCharge ? debtSplit : null,
								description: description.trim(),
								installments: installmentCount,
								isStatementCharge,
								purchaseDate,
								storeName: storeName.trim() || null,
								tagIds,
								time: time || null,
								totalAmount: submittedTotal,
								...(item.metadataMissing?.includes("calendar")
									? { dueDate, statementDate }
									: {}),
							});
						}}
					>
						{pending ? "Salvando…" : "Salvar"}
					</Button>
				</DialogFooter>
			</ImportDialogContent>
		</ImportDialog>
	);
}
