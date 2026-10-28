import { useMutation, useQuery } from "@tanstack/react-query";
import {
	isRecurrenceAssociationCompatible,
	type RecurrenceAssociationTarget,
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
import { RecurrencePeriodField } from "./RecurrencePeriodField";

export default function AssociateRecurrenceDialog({
	target,
	initialDate,
	onOpenChange,
}: {
	target: RecurrenceAssociationTarget;
	initialDate: string;
	onOpenChange: (open: boolean) => void;
}) {
	const fieldId = useId();
	const [recurrenceId, setRecurrenceId] = useState("");
	const [date, setDate] = useState(initialDate.slice(0, 10));
	const [error, setError] = useState("");
	const identity = getCurrentCacheIdentity();
	const query = useQuery({
		enabled: Boolean(identity),
		queryFn: () => dataService.recurrences.getAll(),
		queryKey: queryKeys.recurring.all(identity!),
	});
	const recurrences = (query.data ?? []).filter(item => isRecurrenceAssociationCompatible(item, target));
	const selected = recurrences.find(item => item.id === recurrenceId);
	const mutation = useMutation({
		meta: { cacheOperations: ["recurring"] },
		mutationFn: async () => {
			if (!selected || !date) throw new Error("Selecione uma recorrência e o período da ocorrência.");
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
		onSuccess: () => {
			showToast("Lançamento associado à recorrência.", "positive");
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
											onValueChange={setRecurrenceId}
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
											Nenhuma recorrência com movimentação e contas compatíveis.
										</p>
									)}
									<RecurrencePeriodField
										disabled={mutation.isPending}
										id={fieldId}
										onChange={setDate}
										unit={selected?.unit}
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
