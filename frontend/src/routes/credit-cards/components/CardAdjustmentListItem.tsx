import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CreditCard } from "@/lib/api";
import { ignoredThroughStatement } from "@/lib/card-adjustment";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { CardAdjustmentRow } from "./CardAdjustmentRow";

export function CardAdjustmentListItem({
	card,
	onEdit,
	onRemove,
	pending,
}: {
	card: CreditCard;
	onEdit: () => void;
	onRemove: () => void;
	pending: boolean;
}) {
	const identity = useCacheIdentity();
	const statements = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.creditCards.getStatements(card.id),
		queryKey: [...queryKeys.creditCardStatements.list(identity!, card.id), "adjustment"],
	});
	if (statements.isPending) return <Skeleton className="h-20 rounded-xl" />;
	if (statements.isError)
		return <p className="text-destructive text-sm">Não foi possível carregar as faturas deste cartão.</p>;
	return (
		<CardAdjustmentRow
			card={card}
			onEdit={onEdit}
			onRemove={onRemove}
			pending={pending}
			statementDate={ignoredThroughStatement(statements.data, card.ignoreStatementsBefore)?.dueDate ?? null}
		/>
	);
}
