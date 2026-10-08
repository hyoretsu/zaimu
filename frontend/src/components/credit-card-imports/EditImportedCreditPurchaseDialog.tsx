import { withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { useEffect, useState } from "react";
import { DebtSplitEditor } from "@/components/debts";
import { ImportDialog, ImportDialogContent } from "@/components/imports";
import { StorePicker } from "@/components/stores";
import { TagPicker } from "@/components/tags";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { DateField } from "@/components/ui/DateField";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { TimeField } from "@/components/ui/TimeField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { CreditCardImportItem } from "@/lib/api";
import type { dataService } from "@/lib/dataService";
import { calculateDebtSplit, debtSplitToInput } from "@/lib/debt-split";
import { cleanFinancedDescription, getFinancedOperation } from "@/lib/financing-source-reference";

export function EditImportedCreditPurchaseDialog({
	currencyCode,
	item,
	onOpenChange,
	onSubmit,
	open,
	pending,
}: {
	currencyCode: string;
	item: CreditCardImportItem | null;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: Parameters<typeof dataService.creditCardImports.updateItem>[2]) => void;
	open: boolean;
	pending: boolean;
}) {
	const [description, setDescription] = useDebouncedInput("", () => undefined);
	const [installments, setInstallments] = useDebouncedInput("1", () => undefined);
	const [debtSplit, setDebtSplit] = useState(() => debtSplitToInput());
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
			getFinancedOperation(item.description)?.merchant ??
				withoutImportedAnticipation(cleanFinancedDescription(item.description)),
		);
		setInstallments(String(item.installments));
		setDebtSplit(debtSplitToInput(item.debtSplit));
		setIsDebt(!item.isStatementCharge && Boolean(item.debtSplit));
		setIsStatementCharge(item.isStatementCharge ?? false);
		setPurchaseDate(item.purchaseDate);
		setStoreName(item.storeName ?? "");
		setTagIds(item.tagIds);
		setTotalAmount(String(item.totalAmount));
		setTime(item.time ?? "");
		setStatementDate("");
		setDueDate("");
	}, [item, open, setDescription, setInstallments]);
	if (!item) return null;
	const installmentCount = isStatementCharge ? 1 : Number.parseInt(installments, 10);
	const isValid =
		(!item.metadataMissing?.includes("calendar") || Boolean(statementDate && dueDate)) &&
		Number(totalAmount) > 0 &&
		Number.isInteger(installmentCount) &&
		installmentCount >= 1 &&
		installmentCount <= 48 &&
		(!isDebt || Boolean(calculateDebtSplit(Number(totalAmount), debtSplit, currencyCode)));

	return (
		<ImportDialog onOpenChange={onOpenChange} open={open}>
			<ImportDialogContent className="max-h-[92dvh] overflow-hidden p-0 sm:max-w-lg">
				<ScrollArea className="max-h-[92dvh]">
					<div className="grid gap-6 p-6">
						<DialogHeader>
							<DialogTitle>Editar compra importada</DialogTitle>
							<DialogDescription>Alterações valem antes da criação das parcelas.</DialogDescription>
						</DialogHeader>
						<div className="grid gap-5">
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
								<div className="grid gap-4 sm:grid-cols-2">
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
								</div>
							)}

							<MoneyField
								currencyCode={currencyCode}
								id="imported-purchase-total"
								label="Valor total"
								onValueChange={setTotalAmount}
								required
								value={totalAmount}
							/>
							<div className="grid gap-4 sm:grid-cols-3">
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
							</div>
							<TagPicker onValueChange={setTagIds} value={tagIds} />
							<CheckboxField
								checkboxProps={{
									checked: isStatementCharge,
									id: "imported-purchase-is-charge",
									onCheckedChange: checked => {
										setIsStatementCharge(checked === true);
										if (checked) setIsDebt(false);
									},
								}}
							>
								Encargo da fatura (juros, multa ou IOF)
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
						<DialogFooter>
							<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
								Descartar
							</Button>
							<Button
								className="cursor-pointer disabled:cursor-not-allowed"
								disabled={!isValid || pending}
								onClick={() =>
									onSubmit({
										debtSplit: isDebt && !isStatementCharge ? debtSplit : null,
										description: description.trim(),
										installments: installmentCount,
										isStatementCharge,
										purchaseDate,
										storeName: storeName.trim() || null,
										tagIds,
										time: time || null,
										totalAmount: Number(totalAmount),
										...(item.metadataMissing?.includes("calendar") ? { dueDate, statementDate } : {}),
									})
								}
							>
								{pending ? "Salvando…" : "Salvar"}
							</Button>
						</DialogFooter>
					</div>
				</ScrollArea>
			</ImportDialogContent>
		</ImportDialog>
	);
}
