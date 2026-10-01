import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FinancialAccount, Transaction } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { EditTransactionForm } from "./components";

export function EditTransactionDialog(props: {
	account?: FinancialAccount;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	transaction: Transaction | null;
}) {
	const identity = useCacheIdentity();
	const detail = useQuery({
		enabled: identity !== null && props.open && props.transaction !== null,
		queryFn: () => dataService.transactions.getDetail(props.transaction!.id),
		queryKey: [...queryKeys.transactions.all(identity!), "detail", props.transaction?.id],
	});
	if (!props.open || !props.transaction) return null;
	if (!detail.isPending && !detail.isError && detail.data)
		return <EditTransactionForm {...props} transaction={detail.data} />;
	return (
		<Dialog onOpenChange={props.onOpenChange} open>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Editar transação</DialogTitle>
				</DialogHeader>
				{detail.isPending ? (
					<div className="space-y-4">
						{Array.from({ length: 5 }, (_, index) => (
							<Skeleton className="h-12 w-full" key={index} />
						))}
					</div>
				) : (
					<div role="alert">
						<p>Falha ao carregar transação.</p>
						<Button className="mt-3" onClick={() => void detail.refetch()} variant="outline">
							Tentar novamente
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
