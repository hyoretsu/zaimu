import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuInfo, LuRefreshCw } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
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
import { Skeleton } from "@/components/ui/Skeleton";
import { readHistoryCollection, retryHistoryCollection } from "@/lib/financial-history";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

const stateLabels: Record<string, string> = {
	COMPLETED: "Concluída",
	COMPLETED_WITH_GAPS: "Concluída com lacunas",
	FAILED: "Falhou",
	NO_DATA: "Sem publicação",
	PENDING: "Pendente",
	RUNNING: "Executando",
};
export function HistoryCollectionProgress({ collectionId, title }: { collectionId: string; title: string }) {
	const owner = useCacheIdentity();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const queryKey = ["identity", owner, "financial-history", collectionId];
	const query = useQuery({
		enabled: !!owner,
		queryFn: () => readHistoryCollection(collectionId),
		queryKey,
		refetchInterval: query =>
			["PENDING", "RUNNING"].includes(query.state.data?.progress.state ?? "") ? 10_000 : false,
	});
	const retry = useMutation({
		mutationFn: () => retryHistoryCollection(collectionId),
		onError: error => showToast(error.message, "negative"),
		onSuccess: value => {
			queryClient.setQueryData(queryKey, value);
			showToast("Falhas reenviadas para coleta", "positive");
		},
	});
	if (query.isPending) return <Skeleton className="h-20 w-full rounded-xl" />;
	if (query.isError || !query.data)
		return (
			<p className="text-muted-foreground text-sm">
				Progresso indisponível. Histórico armazenado permanece preservado.
			</p>
		);
	const collection = query.data;
	const progress = collection.progress;
	return (
		<section aria-label={title} className="space-y-2 rounded-xl border p-3">
			<p className="font-medium text-sm">
				{title} - {stateLabels[progress.state]}
			</p>
			<progress
				aria-label="Cobertura do histórico"
				className="h-2 w-full accent-primary"
				max={Math.max(1, progress.requestedDays)}
				value={progress.coveredDays}
			/>
			<p className="text-muted-foreground text-xs">
				{progress.completed}/{progress.total} unidades concluídas. {progress.coveredDays}/
				{progress.requestedDays} dias cobertos por série.
			</p>
			<ActionGroup>
				<Button onClick={() => setOpen(true)} size="sm" variant="outline">
					<LuInfo /> Detalhes
				</Button>
				{progress.canRetry && (
					<Button disabled={retry.isPending} onClick={() => retry.mutate()} size="sm" variant="outline">
						<LuRefreshCw /> {retry.isPending ? "Reenviando..." : "Tentar novamente"}
					</Button>
				)}
			</ActionGroup>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent className="overflow-hidden">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>
							Janela: {collection.startDate} - {collection.endDate}. {progress.failed} falhas;{" "}
							{progress.unavailable} dias sem cotação.
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="h-64 min-h-0">
						<div className="space-y-2 pr-3">
							{collection.units.map(unit => (
								<div className="rounded-lg border p-2 text-xs" key={unit.id}>
									<p>
										{unit.series} - {unit.startDate} - {unit.endDate}
									</p>
									<p>{stateLabels[unit.state]}</p>
									{unit.lastError && <p className="text-destructive">{unit.lastError}</p>}
								</div>
							))}
						</div>
					</ScrollArea>
					<DialogFooter>
						<Button onClick={() => setOpen(false)} variant="outline">
							Fechar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
