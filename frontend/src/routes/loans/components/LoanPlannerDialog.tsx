import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
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
import { loanPlannerService } from "@/lib/loan-planner-service";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { useCurrencyStore } from "@/stores/currency";
import { LoanPlannerContent } from "./LoanPlannerContent";
export function LoanPlannerDialog({ onClose }: { onClose: () => void }) {
	const identity = useCacheIdentity();
	const currency = useCurrencyStore(s => s.currency);
	const context = useQuery({
		enabled: !!identity,
		queryFn: () => loanPlannerService.context(currency),
		queryKey: [...queryKeys.loans.all(identity!), "planner-context", currency],
		refetchOnWindowFocus: false,
		staleTime: 0,
	});
	return (
		<Dialog
			modal
			onOpenChange={open => {
				if (!open) onClose();
			}}
			open
			url={{ clear: ["planner"], parameter: "planner", value: "true" }}
		>
			<DialogContent className="flex flex-col sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle>Planejador de antecipação</DialogTitle>
					<DialogDescription>
						Compare antecipar, quitar e manter dinheiro rendendo, preservando reserva diária.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					{context.isPending ? (
						<div className="space-y-4">
							<Skeleton className="h-24" />
							<Skeleton className="h-60" />
							<Skeleton className="h-40" />
						</div>
					) : context.isError ? (
						<div role="alert">
							<p>
								Falha ao carregar previsão financeira. Verifique histórico, calendários e
								cotações.
							</p>
							<Button onClick={() => void context.refetch()} variant="outline">
								Tentar novamente
							</Button>
						</div>
					) : context.data ? (
						<LoanPlannerContent key={context.data.capturedAt} snapshot={context.data} />
					) : null}
				</DialogBody>
				<DialogFooter>
					<Button
						disabled={context.isFetching}
						onClick={() => void context.refetch()}
						variant="outline"
					>
						Atualizar dados
					</Button>
					<Button onClick={onClose} variant="outline">
						Fechar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
