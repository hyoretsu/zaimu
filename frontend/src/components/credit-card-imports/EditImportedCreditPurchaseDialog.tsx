import { useEffect, useState } from "react";
import { DebtSplitEditor } from "@/components/debts";
import { StorePicker } from "@/components/stores";
import { TagPicker } from "@/components/tags";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { CreditCardImportItem } from "@/lib/api";
import type { dataService } from "@/lib/dataService";
import { getCurrentLocalTime } from "@/lib/date";
import { calculateDebtSplit, debtSplitToInput } from "@/lib/debt-split";

export function EditImportedCreditPurchaseDialog({
	item,
	onOpenChange,
	onSubmit,
	open,
	pending,
}: {
	item: CreditCardImportItem | null;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: Parameters<typeof dataService.creditCardImports.updateItem>[2]) => void;
	open: boolean;
	pending: boolean;
}) {
	const [description, setDescription] = useDebouncedInput("", () => undefined);
	const [installments, setInstallments] = useDebouncedInput("1", () => undefined);
	const [debtSplit, setDebtSplit] = useState(() => debtSplitToInput());
	const [isDebt, setIsDebt] = useState(false);
	const [purchaseDate, setPurchaseDate] = useState("");
	const [sendWithoutTime, setSendWithoutTime] = useState(true);
	const [storeName, setStoreName] = useState("");
	const [tagIds, setTagIds] = useState<string[]>([]);
	const [totalAmount, setTotalAmount] = useState("");
	const [time, setTime] = useState(getCurrentLocalTime());
	useEffect(() => {
		if (!item || !open) return;
		setDescription(item.description);
		setInstallments(String(item.installments));
		setDebtSplit(debtSplitToInput(item.debtSplit));
		setIsDebt(Boolean(item.debtSplit));
		setPurchaseDate(item.purchaseDate);
		setSendWithoutTime(!item.time);
		setStoreName(item.storeName ?? "");
		setTagIds(item.tagIds);
		setTotalAmount(String(item.totalAmount));
		setTime(item.time ?? getCurrentLocalTime());
	}, [item, open, setDescription, setInstallments]);
	if (!item) return null;
	const installmentCount = Number.parseInt(installments, 10);
	const isValid =
		description.trim().length > 0 &&
		Number(totalAmount) > 0 &&
		Number.isInteger(installmentCount) &&
		installmentCount >= 1 &&
		installmentCount <= 48 &&
		(!isDebt || Boolean(calculateDebtSplit(Number(totalAmount), debtSplit)));

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] overflow-hidden p-0 sm:max-w-lg">
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
								label="Descrição"
								name="imported-purchase-description"
								onChange={event => setDescription(event.currentTarget.value)}
								placeholder="Ex: Mercado Livre"
								required
								type="text"
								value={description}
							/>
							<StorePicker onValueChange={setStoreName} value={storeName} />
							<MoneyField
								id="imported-purchase-total"
								label="Valor total"
								onValueChange={setTotalAmount}
								required
								value={totalAmount}
							/>
							<div className="grid gap-4 sm:grid-cols-3">
								<FormField
									autoComplete="off"
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
									value={installments}
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
								<FormField
									disabled={sendWithoutTime}
									id="imported-purchase-time"
									label="Horário"
									name="imported-purchase-time"
									onChange={event => setTime(event.currentTarget.value)}
									type="time"
									value={sendWithoutTime ? "" : time}
								/>
							</div>
							<CheckboxField
								align="start"
								checkboxProps={{
									checked: sendWithoutTime,
									id: "imported-purchase-without-time",
									onCheckedChange: checked => setSendWithoutTime(checked === true),
								}}
							>
								<span className="font-medium text-foreground-muted">Enviar sem horário</span>
							</CheckboxField>
							<TagPicker onValueChange={setTagIds} value={tagIds} />
							<div className="grid gap-3 rounded-2xl border p-3">
								<CheckboxField
									checkboxProps={{
										checked: isDebt,
										id: "imported-purchase-is-debt",
										onCheckedChange: checked => setIsDebt(checked === true),
									}}
								>
									<span>Esta compra é de uma dívida</span>
								</CheckboxField>
								{isDebt ? (
									<DebtSplitEditor amount={Number(totalAmount)} onChange={setDebtSplit} value={debtSplit} />
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
										debtSplit: isDebt ? debtSplit : null,
										description: description.trim(),
										installments: installmentCount,
										purchaseDate,
										storeName: storeName.trim() || null,
										tagIds,
										time: sendWithoutTime ? null : time,
										totalAmount: Number(totalAmount),
									})
								}
							>
								{pending ? "Salvando…" : "Salvar"}
							</Button>
						</DialogFooter>
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
