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
import {
	DuplicateCandidateList,
	type DuplicateField,
	DuplicateFieldComparison,
	type DuplicateFieldOption,
	type DuplicateResolutionSources,
	type DuplicateSource,
} from "./components";

export type { DuplicateResolutionSources } from "./components";

type Field = DuplicateField;
type Source = DuplicateSource;
const baseFields: DuplicateFieldOption[] = [
	{ key: "amount", label: "Valor" },
	{ key: "date", label: "Data" },
	{ key: "debtSplit", label: "Dívida" },
	{ key: "time", label: "Horário" },
	{ key: "description", label: "Descrição" },
	{ key: "type", label: "Tipo" },
	{ key: "storeName", label: "Loja" },
	{ key: "tagIds", label: "Tags" },
];
const transferAccountFields: DuplicateFieldOption[] = [
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
		<Dialog modal onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden p-5 sm:max-w-3xl sm:p-6">
				<DialogHeader>
					<DialogTitle>Resolver duplicata</DialogTitle>
					<DialogDescription>
						Escolha a duplicata e selecione a origem de cada dado. A transação do extrato será atualizada e
						permanecerá no extrato até sua aprovação.
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0">
					<div className="space-y-4 pr-4">
						{item.duplicates.length > 1 ? (
							<DuplicateCandidateList
								candidates={item.duplicates}
								formatCandidate={formatDuplicateCandidate}
								onSelect={candidate => {
									setSelectedDuplicateId(candidate.id);
									setSources(
										Object.fromEntries(getFields(candidate.type).map(field => [field.key, "imported"])),
									);
								}}
								selectedId={duplicate.id}
							/>
						) : null}
						<DuplicateFieldComparison
							fields={fields}
							isSourceSelected={isSourceSelected}
							onSelectAll={selectAllFrom}
							onSelectField={(field, source) => setSources(current => ({ ...current, [field]: source }))}
							sources={sources}
							value={value}
						/>
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
