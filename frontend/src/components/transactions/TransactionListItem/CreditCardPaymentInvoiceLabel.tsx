import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { statementLabel } from "@/lib/statement-label";

export function CreditCardPaymentInvoiceLabel({
	cardId,
	statementDate,
}: {
	cardId: string;
	statementDate: string;
}) {
	const identity = useCacheIdentity();
	const statements = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.creditCards.getStatements(cardId),
		queryKey: queryKeys.creditCardStatements.list(identity!, cardId),
	});
	if (statements.isPending) return <Skeleton className="inline-block h-3 w-16" />;
	const statement = statements.data?.find(
		item => item.statementDate.slice(0, 10) === statementDate.slice(0, 10),
	);
	if (!statement) return <span>Indisponível</span>;
	return <>{statementLabel(statement, statements.data ?? [])}</>;
}
