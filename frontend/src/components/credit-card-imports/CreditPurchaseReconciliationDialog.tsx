import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { CreditCardImportItem, CreditCardImportPurchaseDuplicate } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";

export type CreditPurchaseReconciliationField =
	| "debtSplit"
	| "description"
	| "purchaseDate"
	| "storeName"
	| "tagIds"
	| "time";
export type CreditPurchaseReconciliationSources = Partial<
	Record<CreditPurchaseReconciliationField, "duplicate" | "imported">
>;

interface Field {
	key: CreditPurchaseReconciliationField;
	label: string;
}
type Source = "duplicate" | "imported";

const fields: Field[] = [
	{ key: "description", label: "Descrição" },
	{ key: "storeName", label: "Loja" },
	{ key: "purchaseDate", label: "Data" },
	{ key: "time", label: "Horário" },
	{ key: "tagIds", label: "Tags" },
	{ key: "debtSplit", label: "Dívida" },
];
const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

function formatInstallments(installments: number, installmentAmount: number) {
	return installments === 1
		? `À vista · ${currency.format(installmentAmount)}`
		: `${installments}x de ${currency.format(installmentAmount)}`;
}

function formatExistingPurchase(candidate: CreditCardImportPurchaseDuplicate) {
	const registered =
		candidate.installments === 1
			? "Compra à vista registrada"
			: `${candidate.existingInstallments} ${candidate.existingInstallments === 1 ? "parcela registrada" : "parcelas registradas"}`;
	return `${candidate.storeName || candidate.description} · ${registered}`;
}

export function CreditPurchaseReconciliationDialog({
	item,
	onOpenChange,
	onReconcile,
	open,
	pending,
}: {
	item: CreditCardImportItem | null;
	onOpenChange: (open: boolean) => void;
	onReconcile: (
		candidate: CreditCardImportPurchaseDuplicate,
		sources: CreditPurchaseReconciliationSources,
	) => Promise<void>;
	open: boolean;
	pending: boolean;
}) {
	const [selectedDuplicateId, setSelectedDuplicateId] = useState<string | null>(null);
	const duplicate =
		item?.duplicates.find(candidate => candidate.id === selectedDuplicateId) ?? item?.duplicates[0] ?? null;
	const [sources, setSources] = useState<CreditPurchaseReconciliationSources>(() =>
		Object.fromEntries(fields.map(field => [field.key, "imported"])),
	);
	const [isSaving, setIsSaving] = useState(false);
	useEffect(() => {
		if (!open) return;
		setSelectedDuplicateId(item?.duplicates[0]?.id ?? null);
		setSources(Object.fromEntries(fields.map(field => [field.key, "imported"])));
	}, [item?.id, open]);
	if (!item || !duplicate) return null;
	const sourceValue = (source: Source, field: CreditPurchaseReconciliationField) => {
		const record = source === "imported" ? item : duplicate;
		if (field === "purchaseDate") return formatLocalDate(record.purchaseDate);
		if (field === "time") return formatLocalTime(record.time ?? undefined) ?? "Não informado";
		if (field === "tagIds")
			return record.tags.length ? record.tags.map(tag => tag.name).join(", ") : "Sem tags";
		if (field === "debtSplit")
			return record.debtSplit
				? record.debtSplit.participants.map(participant => participant.debtPersonName).join(", ")
				: "Sem dívida";
		return record[field] || "Não informado";
	};
	const selectAllFrom = (source: Source) =>
		setSources(Object.fromEntries(fields.map(field => [field.key, source])));
	const isSourceSelected = (source: Source) => fields.every(field => sources[field.key] === source);
	const save = async () => {
		setIsSaving(true);
		try {
			await onReconcile(duplicate, sources);
		} finally {
			setIsSaving(false);
		}
	};
	const purchaseLabel = item.installments === 1 ? "compra" : "compra parcelada";
	const resolutionDescription =
		item.installments === 1
			? "A aprovação atualiza o registro existente."
			: "A aprovação atualiza o registro existente e cria somente parcelas ausentes.";

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Conciliar {purchaseLabel} existente</DialogTitle>
					<DialogDescription>
						Escolha a origem de cada dado. O parcelamento e os valores da fatura serão preservados.{" "}
						{resolutionDescription}
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 pr-1">
					<div className="space-y-4 pr-3">
						{item.duplicates.length > 1 ? (
							<div className="space-y-2">
								<p className="font-medium text-sm">Compras existentes ({item.duplicates.length})</p>
								<div className="flex flex-wrap gap-2">
									{item.duplicates.map((candidate, index) => (
										<Button
											aria-pressed={candidate.id === duplicate.id}
											className="cursor-pointer"
											key={candidate.id}
											onClick={() => {
												setSelectedDuplicateId(candidate.id);
												setSources(Object.fromEntries(fields.map(field => [field.key, "imported"])));
											}}
											type="button"
											variant={candidate.id === duplicate.id ? "default" : "outline"}
										>
											Compra {index + 1}: {formatExistingPurchase(candidate)}
										</Button>
									))}
								</div>
							</div>
						) : null}
						<div className="rounded-2xl border bg-muted/30 p-3 text-sm">
							<span className="font-medium">Fatura: </span>
							{formatInstallments(item.installments, item.installmentAmount)} ·{" "}
							{formatExistingPurchase(duplicate)}
						</div>
						<div className="overflow-hidden rounded-2xl border">
							<div className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] border-b text-center font-medium text-xs sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]">
								<span />
								<Button
									aria-pressed={isSourceSelected("imported")}
									className="h-auto min-h-10 w-full cursor-pointer rounded-none border-border px-2 py-3 text-xs sm:px-3"
									onClick={() => selectAllFrom("imported")}
									type="button"
									variant={isSourceSelected("imported") ? "default" : "outline"}
								>
									Importada
								</Button>
								<Button
									aria-pressed={isSourceSelected("duplicate")}
									className="h-auto min-h-10 w-full cursor-pointer rounded-none border-border border-l px-2 py-3 text-xs sm:px-3"
									onClick={() => selectAllFrom("duplicate")}
									type="button"
									variant={isSourceSelected("duplicate") ? "default" : "outline"}
								>
									Existente
								</Button>
							</div>
							{fields.map(field => (
								<div
									className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] border-b last:border-0 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]"
									key={field.key}
								>
									<span className="flex items-center break-words px-2 font-medium text-xs sm:px-3">
										{field.label}
									</span>
									<Button
										className="h-auto min-h-11 min-w-0 cursor-pointer justify-start whitespace-normal break-words rounded-none border-x-0 border-y-0 border-l px-2 text-left text-xs sm:px-3"
										onClick={() => setSources(current => ({ ...current, [field.key]: "imported" }))}
										size="sm"
										variant={sources[field.key] === "imported" ? "default" : "outline"}
									>
										{sourceValue("imported", field.key)}
									</Button>
									<Button
										className="h-auto min-h-11 min-w-0 cursor-pointer justify-start whitespace-normal break-words rounded-none border-0 px-2 text-left text-xs sm:px-3"
										onClick={() => setSources(current => ({ ...current, [field.key]: "duplicate" }))}
										size="sm"
										variant={sources[field.key] === "duplicate" ? "default" : "outline"}
									>
										{sourceValue("duplicate", field.key)}
									</Button>
								</div>
							))}
						</div>
					</div>
				</ScrollArea>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
						Cancelar
					</Button>
					<Button className="cursor-pointer" disabled={pending || isSaving} onClick={save}>
						Salvar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
