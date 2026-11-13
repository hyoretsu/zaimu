import { useMutation, useQuery } from "@tanstack/react-query";
import {
	type RecurrenceAssociationTarget,
	type RecurrenceUnit,
	validateRecurrenceAssociation,
} from "@zaimu/finance/recurrence";
import { useId, useState } from "react";
import { LuLink } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { getCurrentCacheIdentity, queryKeys } from "@/lib/query-cache";
import { showToast } from "@/stores";
import type { PendingImportRecurrence } from "./AssociateImportedRecurrenceDialog";
import { RecurrencePeriodField } from "./RecurrencePeriodField";

const periodUnitOptions: { label: string; value: RecurrenceUnit }[] = [
	{ label: "Dia", value: "DAY" },
	{ label: "Semana", value: "WEEK" },
	{ label: "Mês", value: "MONTH" },
	{ label: "Ano", value: "YEAR" },
];

export default function AssociateRecurrenceDialog({
	target,
	onAssociate,
	onAssociated,
	initialDate,
	onOpenChange,
}: {
	onAssociated?: () => Promise<unknown>;
	onAssociate?: (selection: PendingImportRecurrence) => unknown;
	target: RecurrenceAssociationTarget;
	initialDate: string;
	onOpenChange: (open: boolean) => void;
}) {
	const fieldId = useId();
	const [recurrenceId, setRecurrenceId] = useState("");
	const [date, setDate] = useState(initialDate.slice(0, 10));
	const [periodUnit, setPeriodUnit] = useState<RecurrenceUnit | "">("");
	const [error, setError] = useState("");
	const identity = getCurrentCacheIdentity();
	const query = useQuery({
		enabled: Boolean(identity),
		queryFn: () => dataService.recurrences.getAll(),
		queryKey: queryKeys.recurring.all(identity!),
	});
	const recurrences = query.data ?? [];
	const selected = recurrences.find(item => item.id === recurrenceId);
	const unit = (periodUnit || selected?.unit) as RecurrenceUnit | undefined;
	const mutation = useMutation({
		meta: { cacheOperations: onAssociate ? [] : ["recurring"] },
		mutationFn: async () => {
			if (!selected || !date) throw new Error("Selecione uma recorrência e o período da ocorrência.");
			if (onAssociate)
				return onAssociate({
					date,
					name: selected.name,
					preview: {
						debtSplit: selected.debtSplit,
						storeName: selected.storeName,
						tagIds: selected.tagIds,
						tags: selected.tags,
					},
					recurrenceId: selected.id,
				});
			return dataService.recurrences.associate(selected.id, {
				date,
				kind: target.kind,
				recordId: target.id,
			});
		},
		onError: error => {
			setError(error.message);
			showToast(error.message, "negative");
		},
		onSuccess: async () => {
			if (onAssociated) {
				try {
					await onAssociated();
				} catch {
					showToast("Vínculo salvo. Atualize a revisão para consultar os dados atuais.", "info");
				}
			}
			showToast(
				onAssociate
					? "Recorrência definida. Aprove o item para salvar o vínculo."
					: "Lançamento associado à recorrência.",
				"positive",
			);
			onOpenChange(false);
		},
	});
	return (
		<Dialog
			onOpenChange={open => {
				if (!mutation.isPending) onOpenChange(open);
			}}
			open
		>
			<DialogContent showCloseButton={!mutation.isPending}>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
					onSubmit={event => {
						event.preventDefault();
						if (mutation.isPending) return;
						try {
							if (!selected || !date)
								throw new Error("Selecione uma recorrência e o período da ocorrência.");
							validateRecurrenceAssociation(selected, target, date);
						} catch (error) {
							const message =
								error instanceof Error
									? error.message
									: "Não foi possível validar o período.";
							setError(message);
							showToast(message, "negative");
							return;
						}
						setError("");
						mutation.mutate();
					}}
				>
					<DialogHeader>
						<DialogTitle>Associar a recorrência</DialogTitle>
						<DialogDescription>
							{onAssociate && "O vínculo será gravado quando o item for aprovado. "}
							Escolha o período representado por este lançamento. A regeneração do histórico
							preservará esse vínculo sem duplicá-lo.
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<div className="space-y-5">
							{query.isPending ? (
								<div className="space-y-5">
									<Skeleton className="h-16 w-full" />
									<Skeleton className="h-16 w-full" />
								</div>
							) : query.isError ? (
								<div role="alert">
									<p>Não foi possível carregar recorrências.</p>
									<Button
										onClick={() => void query.refetch()}
										type="button"
										variant="outline"
									>
										Tentar novamente
									</Button>
								</div>
							) : (
								<>
									<div className="space-y-2">
										<CustomSelect
											disabled={mutation.isPending}
											label="Recorrência"
											onValueChange={value => {
												setRecurrenceId(value);
												setPeriodUnit("");
											}}
											options={recurrences.map(item => ({
												label: item.name,
												value: item.id,
											}))}
											placeholder="Selecione uma recorrência"
											required
											searchable
											value={recurrenceId}
										/>
									</div>
									{!recurrences.length && (
										<p className="text-muted-foreground text-sm">
											Nenhuma recorrência cadastrada.
										</p>
									)}
									<CustomSelect
										disabled={mutation.isPending || !selected}
										label="Tipo de referência"
										onValueChange={value => setPeriodUnit(value as RecurrenceUnit)}
										options={periodUnitOptions}
										placeholder="Selecione o tipo de referência"
										value={unit ?? ""}
									/>
									<RecurrencePeriodField
										disabled={mutation.isPending}
										id={fieldId}
										onChange={setDate}
										unit={unit}
										value={date}
									/>
								</>
							)}
							{error && (
								<p className="text-destructive text-sm" role="alert">
									{error}
								</p>
							)}
							{mutation.isPending && (
								<p className="text-muted-foreground text-sm" role="status">
									Associando lançamento...
								</p>
							)}
						</div>
					</DialogBody>
					<DialogFooter>
						<Button
							disabled={mutation.isPending}
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						<Button
							disabled={
								mutation.isPending || query.isPending || query.isError || !selected || !date
							}
							type="submit"
						>
							<LuLink />
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
