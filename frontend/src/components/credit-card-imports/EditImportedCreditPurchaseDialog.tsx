import { useEffect, useState } from "react";
import { StorePicker } from "@/components/stores";
import { TagPicker } from "@/components/tags";
import { Button } from "@/components/ui/Button";
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
	const [currentInstallment, setCurrentInstallment] = useDebouncedInput("1", () => undefined);
	const [purchaseDate, setPurchaseDate] = useState("");
	const [storeName, setStoreName] = useState("");
	const [tagIds, setTagIds] = useState<string[]>([]);
	const [totalAmount, setTotalAmount] = useState("");
	useEffect(() => {
		if (!item || !open) return;
		setDescription(item.description);
		setInstallments(String(item.installments));
		setCurrentInstallment(String(item.currentInstallment));
		setPurchaseDate(item.purchaseDate);
		setStoreName(item.storeName ?? "");
		setTagIds(item.tagIds);
		setTotalAmount(String(item.totalAmount));
	}, [item, open, setCurrentInstallment, setDescription, setInstallments]);
	if (!item) return null;
	const installmentCount = Number.parseInt(installments, 10);
	const currentCount = Number.parseInt(currentInstallment, 10);
	const isValid =
		description.trim().length > 0 &&
		Number(totalAmount) > 0 &&
		Number.isInteger(installmentCount) &&
		installmentCount >= 1 &&
		installmentCount <= 48 &&
		Number.isInteger(currentCount) &&
		currentCount >= 1 &&
		currentCount <= installmentCount;

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
							<div className="grid gap-4 sm:grid-cols-2">
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
								<FormField
									autoComplete="off"
									id="imported-purchase-current-installment"
									inputMode="numeric"
									label="Parcela nesta fatura"
									name="imported-purchase-current-installment"
									onChange={event =>
										setCurrentInstallment(event.currentTarget.value.replace(/\D/g, "").slice(0, 2))
									}
									placeholder="Ex: 3"
									required
									type="text"
									value={currentInstallment}
								/>
							</div>
							<DateField
								autoComplete="off"
								id="imported-purchase-date"
								label="Data da primeira parcela"
								name="imported-purchase-date"
								onValueChange={setPurchaseDate}
								required
								value={purchaseDate}
							/>
							<TagPicker onValueChange={setTagIds} value={tagIds} />
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
										currentInstallment: currentCount,
										description: description.trim(),
										installments: installmentCount,
										purchaseDate,
										storeName: storeName.trim() || null,
										tagIds,
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
