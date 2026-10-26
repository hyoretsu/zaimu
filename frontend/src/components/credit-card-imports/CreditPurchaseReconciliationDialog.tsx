import { importedAnticipation } from "@zaimu/finance/imported-anticipation";
import { formatMoney } from "@zaimu/finance/money";
import { useEffect, useState } from "react";
import { ImportDialog, ImportDialogContent } from "@/components/imports";
import { Button } from "@/components/ui/Button";
import {
	DialogBody,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import type { CreditCardImportItem, CreditCardImportPurchaseDuplicate } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { formatDebtSplitNames } from "@/lib/debt-split";

export type CreditPurchaseReconciliationField =
	"debtSplit" | "description" | "purchaseDate" | "storeName" | "tagIds" | "time";
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
function formatExistingPurchase(candidate: CreditCardImportPurchaseDuplicate, currencyCode: string) {
	const registered = candidate.id.startsWith("pending:")
		? "Compra desta importação - ainda não aprovada"
		: candidate.installments === 1
			? "Compra à vista registrada"
			: `${candidate.existingInstallments} ${candidate.existingInstallments === 1 ? "parcela registrada" : "parcelas registradas"}`;
	return `${candidate.storeName || candidate.description} · ${formatMoney(candidate.totalAmount, currencyCode, "pt-BR")} · ${candidate.installments}x de ${formatMoney(candidate.installmentAmount, currencyCode, "pt-BR")} · ${registered}`;
}

export function CreditPurchaseReconciliationDialog({
	currencyCode,
	initialSelection,
	item,
	onOpenChange,
	onReconcile,
	open,
	pending,
}: {
	currencyCode: string;
	initialSelection?: { duplicateId: string; sources?: CreditPurchaseReconciliationSources };
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
		item?.duplicates.find(candidate => candidate.id === selectedDuplicateId) ??
		item?.duplicates[0] ??
		null;
	const [sources, setSources] = useState<CreditPurchaseReconciliationSources>(() =>
		Object.fromEntries(fields.map(field => [field.key, "imported"])),
	);
	const [isSaving, setIsSaving] = useState(false);
	useEffect(() => {
		if (!open) return;
		setSelectedDuplicateId(initialSelection?.duplicateId ?? item?.duplicates[0]?.id ?? null);
		setSources(
			initialSelection?.sources ?? Object.fromEntries(fields.map(field => [field.key, "imported"])),
		);
	}, [initialSelection, item?.id, open]);
	if (!item || !duplicate) return null;
	const anticipated = importedAnticipation(item.description);
	const refinancing = item.installments !== duplicate.installments;
	const sourceValue = (source: Source, field: CreditPurchaseReconciliationField) => {
		const record = source === "imported" ? item : duplicate;
		if (field === "purchaseDate") return formatLocalDate(record.purchaseDate);
		if (field === "time") return formatLocalTime(record.time ?? undefined) ?? "Não informado";
		if (field === "tagIds")
			return record.tags.length ? record.tags.map(tag => tag.name).join(", ") : "Sem tags";
		if (field === "debtSplit") return formatDebtSplitNames(record.debtSplit) ?? "Sem dívida";
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
	const financialRows = [
		{
			existing: formatMoney(duplicate.totalAmount, currencyCode, "pt-BR"),
			imported: formatMoney(item.totalAmount, currencyCode, "pt-BR"),
			label: "Valor total",
		},
		{
			existing: formatMoney(duplicate.installmentAmount, currencyCode, "pt-BR"),
			imported: formatMoney(item.installmentAmount, currencyCode, "pt-BR"),
			label: "Valor da parcela",
		},
		{ existing: String(duplicate.installments), imported: String(item.installments), label: "Parcelas" },
		{
			existing: `${duplicate.currentInstallment}/${duplicate.installments}`,
			imported: `${item.currentInstallment}/${item.installments}`,
			label: "Parcela atual",
		},
	];

	return (
		<ImportDialog onOpenChange={onOpenChange} open={open}>
			<ImportDialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{anticipated
							? "Vincular antecipação à compra original"
							: refinancing
								? "Reparcelar compra existente"
								: `Conciliar ${purchaseLabel} existente`}
					</DialogTitle>
					<DialogDescription>
						{anticipated
							? "Confira a compra original. As parcelas antecipadas serão movidas para esta fatura."
							: refinancing
								? `Confira a compra original. A aprovação substitui parcelas pendentes por ${item.installments} novas parcelas; preserva as pagas.`
								: "Escolha a origem dos dados. Valores seguem a importação; somente parcelas ausentes serão criadas."}
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div>
						<div className="space-y-4 pr-3">
							{anticipated && item.duplicates.length === 1 && (
								<div className="space-y-1 rounded-xl border p-3 text-sm">
									<p className="font-medium">Compra selecionada automaticamente</p>
									<p className="break-words">{duplicate.description}</p>
									<p className="text-muted-foreground">
										{formatLocalDate(duplicate.purchaseDate)} -{" "}
										{formatExistingPurchase(duplicate, currencyCode)}
									</p>
								</div>
							)}
							{item.duplicates.length > 1 ? (
								<div className="space-y-2">
									<p className="text-sm font-medium">
										Compras existentes ({item.duplicates.length})
									</p>
									<div className="flex flex-wrap gap-2">
										{item.duplicates.map((candidate, index) => (
											<Button
												aria-pressed={candidate.id === duplicate.id}
												className="h-auto min-h-10 max-w-full cursor-pointer py-2"
												key={candidate.id}
												onClick={() => {
													setSelectedDuplicateId(candidate.id);
													setSources(
														initialSelection?.sources ??
															Object.fromEntries(
																fields.map(field => [field.key, "imported"]),
															),
													);
												}}
												type="button"
												variant={
													candidate.id === duplicate.id ? "default" : "outline"
												}
											>
												<span className="min-w-0 text-left break-words whitespace-normal">
													Compra {index + 1}: {candidate.description}
													<span className="block text-xs">
														{formatLocalDate(candidate.purchaseDate)} -{" "}
														{formatExistingPurchase(candidate, currencyCode)}
													</span>
												</span>
											</Button>
										))}
									</div>
								</div>
							) : null}
							{!anticipated && (
								<div className="overflow-hidden rounded-2xl border">
									<div className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] border-b text-center text-xs font-medium sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]">
										<span />
										<Button
											aria-pressed={isSourceSelected("imported")}
											className="border-border h-auto min-h-10 w-full cursor-pointer rounded-none px-2 py-3 text-xs sm:px-3"
											onClick={() => selectAllFrom("imported")}
											type="button"
											variant={isSourceSelected("imported") ? "default" : "outline"}
										>
											Importada
										</Button>
										<Button
											aria-pressed={isSourceSelected("duplicate")}
											className="border-border h-auto min-h-10 w-full cursor-pointer rounded-none border-l px-2 py-3 text-xs sm:px-3"
											onClick={() => selectAllFrom("duplicate")}
											type="button"
											variant={isSourceSelected("duplicate") ? "default" : "outline"}
										>
											Existente
										</Button>
									</div>
									{financialRows.map(row => (
										<div
											className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] border-b text-xs sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]"
											key={row.label}
										>
											<span className="flex items-center px-2 py-3 font-medium break-words sm:px-3">
												{row.label}
											</span>
											<span className="flex min-w-0 items-center border-l px-2 py-3 break-words sm:px-3">
												{row.imported}
											</span>
											<span className="flex min-w-0 items-center border-l px-2 py-3 break-words sm:px-3">
												{row.existing}
											</span>
										</div>
									))}
									{fields.map(field => (
										<div
											className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] border-b last:border-0 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]"
											key={field.key}
										>
											<span className="flex items-center px-2 text-xs font-medium break-words sm:px-3">
												{field.label}
											</span>
											<Button
												className="h-auto min-h-11 min-w-0 cursor-pointer justify-start rounded-none border-x-0 border-y-0 border-l px-2 text-left text-xs break-words whitespace-normal sm:px-3"
												onClick={() =>
													setSources(current => ({
														...current,
														[field.key]: "imported",
													}))
												}
												size="sm"
												variant={
													sources[field.key] === "imported" ? "default" : "outline"
												}
											>
												{sourceValue("imported", field.key)}
											</Button>
											<Button
												className="h-auto min-h-11 min-w-0 cursor-pointer justify-start rounded-none border-0 px-2 text-left text-xs break-words whitespace-normal sm:px-3"
												onClick={() =>
													setSources(current => ({
														...current,
														[field.key]: "duplicate",
													}))
												}
												size="sm"
												variant={
													sources[field.key] === "duplicate" ? "default" : "outline"
												}
											>
												{sourceValue("duplicate", field.key)}
											</Button>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
						Cancelar
					</Button>
					<Button className="cursor-pointer" disabled={pending || isSaving} onClick={save}>
						Salvar
					</Button>
				</DialogFooter>
			</ImportDialogContent>
		</ImportDialog>
	);
}
