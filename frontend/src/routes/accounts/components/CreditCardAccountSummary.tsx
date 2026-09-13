import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CreditCard } from "@/lib/api";
import { calculateCreditCardLimit } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function CreditCardAccountSummary({ card }: { card?: CreditCard }) {
	const identity = useCacheIdentity();
	const statements = useQuery({
		enabled: identity !== null && Boolean(card),
		queryFn: () => dataService.creditCards.getStatements(card!.id),
		queryKey: queryKeys.creditCardStatements.list(identity!, card?.id ?? "unselected"),
	});

	if (!card || statements.isError) {
		return <p className="text-muted-foreground text-sm">Dados do cartão indisponíveis.</p>;
	}

	if (statements.isPending) {
		return (
			<div className="grid gap-4 min-[420px]:grid-cols-2">
				<div className="grid gap-2">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-7 w-28" />
				</div>
				<div className="grid gap-2">
					<Skeleton className="h-3 w-28" />
					<Skeleton className="h-7 w-28" />
				</div>
			</div>
		);
	}

	const currentStatement = statements.data
		?.filter(statement => !statement.isPaid)
		.toSorted((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
	const currentBill = Math.max(0, currentStatement?.balanceAmount ?? 0);
	const limit = calculateCreditCardLimit(card, statements.data ?? []);

	return (
		<div className="grid gap-4 min-[420px]:grid-cols-2">
			<div>
				<p className="text-muted-foreground text-xs">Fatura atual</p>
				<p className="mt-1 font-bold text-lg">{currency.format(currentBill)}</p>
			</div>
			<div>
				<p className="text-muted-foreground text-xs">Limite disponível</p>
				<p className="mt-1 font-bold text-lg">{currency.format(limit.availableLimit)}</p>
			</div>
			{limit.temporaryCredit > 0 && (
				<div className="min-[420px]:col-span-2">
					<p className="text-muted-foreground text-xs">Crédito temporário por pagamento excedente</p>
					<p className="mt-1 font-semibold text-sm">+ {currency.format(limit.temporaryCredit)}</p>
				</div>
			)}
			{card.cashbackRate ? (
				<div className="min-[420px]:col-span-2">
					<p className="text-muted-foreground text-xs">Cashback</p>
					<p className="mt-1 font-semibold text-sm">
						{new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(card.cashbackRate)}%
						{card.cashbackYieldReferenceRate
							? ` · rende ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(card.cashbackYieldReferencePercentage ?? 100)}% de ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(card.cashbackYieldReferenceRate)}% ${card.cashbackYieldPeriod === "YEARLY" ? "ao ano" : "ao mês"}`
							: ""}
					</p>
				</div>
			) : null}
		</div>
	);
}
