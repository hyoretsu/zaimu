import { useQuery } from "@tanstack/react-query";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { CreateRecurringDialog } from "./CreateRecurringDialog";
import type { RecurringListItemData } from "./types";

export function EditRecurringDialog({
	item,
	onOpenChange,
}: {
	item: RecurringListItemData;
	onOpenChange: (open: boolean) => void;
}) {
	const identity = useCacheIdentity();
	const detail = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.recurrences.get(item.id),
		queryKey: [...queryKeys.recurring.all(identity!), "detail", item.id],
	});
	if (detail.isPending || detail.isError)
		return (
			<Dialog onOpenChange={onOpenChange} open>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Editar recorrência</DialogTitle>
					</DialogHeader>
					{detail.isPending ? (
						<div className="space-y-4" role="status">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-24 w-full" />
							<Skeleton className="h-36 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					) : (
						<div className="space-y-4">
							<p>Não foi possível carregar recorrência.</p>
							<ActionGroup>
								<Button onClick={() => detail.refetch()} variant="outline">
									Tentar novamente
								</Button>
							</ActionGroup>
						</div>
					)}
				</DialogContent>
			</Dialog>
		);
	return (
		<CreateRecurringDialog item={{ ...item, recurrence: detail.data }} onOpenChange={onOpenChange} open />
	);
}
