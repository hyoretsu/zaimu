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
import type { TransactionImportDuplicate, TransactionImportItem } from "@/lib/api";
import { formatLocalTime } from "@/lib/date";

export type DuplicateField =
	| "amount"
	| "date"
	| "debtSplit"
	| "description"
	| "destinationFinancialAccountId"
	| "isHidden"
	| "originFinancialAccountId"
	| "storeName"
	| "tagIds"
	| "time"
	| "type";
export type DuplicateSource = "duplicate" | "imported";
export type DuplicateResolutionSources = Partial<Record<DuplicateField, DuplicateSource>>;
type Field = DuplicateField;
type Source = DuplicateSource;
const baseFields: Array<{ key: Field; label: string }> = [
	{ key: "amount", label: "Valor" },
	{ key: "date", label: "Data" },
	{ key: "debtSplit", label: "Dívida" },
	{ key: "time", label: "Horário" },
	{ key: "description", label: "Descrição" },
	{ key: "type", label: "Tipo" },
	{ key: "storeName", label: "Loja" },
	{ key: "tagIds", label: "Tags" },
];
const transferAccountFields: Array<{ key: Field; label: string }> = [
	{ key: "originFinancialAccountId", label: "Conta de origem" },
	{ key: "destinationFinancialAccountId", label: "Conta de destino" },
];
const transactionTypeLabels = {
	EXPENSE: "Saída",
	INCOME: "Entrada",
	TRANSFER: "Transferência",
	YIELD: "Rendimento",
} as const;
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });

function getFields(type?: TransactionImportDuplicate["type"]) {
	return type === "TRANSFER" ? [...baseFields, ...transferAccountFields] : baseFields;
}

function formatDate(value: unknown) {
	const date = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
	return date ? dateFormatter.format(new Date(`${date}T00:00:00Z`)) : "Não informado";
}

function formatDuplicateCandidate(candidate: TransactionImportDuplicate) {
	const source = candidate.source === "TRANSACTION" ? "Existente" : "Importada";
	const description = candidate.description ?? transactionTypeLabels[candidate.type];
	const amount = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(
		Number(candidate.amount),
	);
	return `${source}: ${description} · ${amount} · ${formatDate(candidate.date)}`;
}

export function DuplicateResolutionDialog({
	accountNames,
	item,
	onOpenChange,
	onResolve,
	open,
}: {
	accountNames: Map<string, string>;
	item: TransactionImportItem | null;
	onOpenChange: (open: boolean) => void;
	onResolve: (
		item: TransactionImportItem,
		duplicate: TransactionImportDuplicate,
		data: DuplicateResolutionSources,
	) => Promise<void>;
	open: boolean;
}) {
	const [selectedDuplicateId, setSelectedDuplicateId] = useState<string | null>(null);
	const duplicate =
		item?.duplicates.find(candidate => candidate.id === selectedDuplicateId) ?? item?.duplicates[0] ?? null;
	const fields = getFields(duplicate?.type);
	const [sources, setSources] = useState<DuplicateResolutionSources>(
		() => Object.fromEntries(fields.map(field => [field.key, "imported"])) as Record<Field, Source>,
	);
	const [isSaving, setIsSaving] = useState(false);
	useEffect(() => {
		if (open) {
			const firstDuplicate = item?.duplicates[0];
			setSelectedDuplicateId(firstDuplicate?.id ?? null);
			setSources(Object.fromEntries(getFields(firstDuplicate?.type).map(field => [field.key, "imported"])));
		}
	}, [open, item?.id]);
	if (!item || !duplicate) return null;
	const value = (source: Source, field: Field) => {
		const record = source === "imported" ? item : duplicate;
		const selected = record[field];
		if (field === "amount")
			return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(Number(selected));
		if (field === "date") return formatDate(selected);
		if (field === "debtSplit") {
			const debtSplit = selected as TransactionImportItem["debtSplit"];
			return debtSplit
				? debtSplit.participants.map(participant => participant.debtPersonName).join(", ")
				: "Sem dívida";
		}
		if (field === "time") return formatLocalTime(selected ? String(selected) : undefined) ?? "Não informado";
		if (field === "originFinancialAccountId" || field === "destinationFinancialAccountId")
			return selected ? (accountNames.get(String(selected)) ?? "Conta removida") : "Não informado";
		if (field === "tagIds") {
			const tags = record.tags ?? [];
			return tags.length ? tags.map(tag => tag.name).join(", ") : "Sem tags";
		}
		if (field === "isHidden") return selected ? "Oculta" : "Visível";
		if (field === "type")
			return transactionTypeLabels[selected as keyof typeof transactionTypeLabels] ?? "Não informado";
		return selected ? String(selected) : "Não informado";
	};
	const save = async () => {
		setIsSaving(true);
		try {
			await onResolve(item, duplicate, sources);
		} finally {
			setIsSaving(false);
		}
	};
	const selectAllFrom = (source: Source) => {
		setSources(Object.fromEntries(fields.map(field => [field.key, source])) as Record<Field, Source>);
	};
	const isSourceSelected = (source: Source) => fields.every(field => sources[field.key] === source);
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Resolver duplicata</DialogTitle>
					<DialogDescription>
						Escolha a duplicata e selecione a origem de cada dado. A transação do extrato será atualizada e
						permanecerá no extrato até sua aprovação.
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 pr-1">
					<div className="space-y-4 pr-3">
						{item.duplicates.length > 1 ? (
							<div className="space-y-2">
								<p className="font-medium text-sm">Duplicatas encontradas ({item.duplicates.length})</p>
								<div className="flex flex-wrap gap-2">
									{item.duplicates.map((candidate, index) => (
										<Button
											aria-pressed={candidate.id === duplicate.id}
											className="cursor-pointer"
											key={`${candidate.source}-${candidate.id}`}
											onClick={() => {
												setSelectedDuplicateId(candidate.id);
												setSources(
													Object.fromEntries(getFields(candidate.type).map(field => [field.key, "imported"])),
												);
											}}
											type="button"
											variant={candidate.id === duplicate.id ? "default" : "outline"}
										>
											Duplicata {index + 1}: {formatDuplicateCandidate(candidate)}
										</Button>
									))}
								</div>
							</div>
						) : null}
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
									Nova
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
										{value("imported", field.key)}
									</Button>
									<Button
										className="h-auto min-h-11 min-w-0 cursor-pointer justify-start whitespace-normal break-words rounded-none border-0 px-2 text-left text-xs sm:px-3"
										onClick={() => setSources(current => ({ ...current, [field.key]: "duplicate" }))}
										size="sm"
										variant={sources[field.key] === "duplicate" ? "default" : "outline"}
									>
										{value("duplicate", field.key)}
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
					<Button className="cursor-pointer" disabled={isSaving} onClick={save}>
						Salvar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
