import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/Skeleton";
import { consolidateMoney, type MoneyPosition } from "@/lib/consolidated-money";
import { guestRate } from "@/lib/currency-conversion";
import { createCurrencyFormatter } from "@/lib/format-currency";
import { useCacheIdentity } from "@/lib/query-cache";
import { useCurrencyStore } from "@/stores/currency";

export function PreferredMoneyAmount({
	values,
	date = "latest",
	pending = false,
	error = false,
	debt,
}: {
	values: readonly MoneyPosition[];
	date?: string;
	pending?: boolean;
	error?: boolean;
	/**
	 * "plural" renders the magnitude with a small "Te devem" (positive) / "Você deve" (negative) below;
	 * "absolute" renders the magnitude only, for callers that label the direction themselves.
	 */
	debt?: "absolute" | "plural";
}) {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const currency = useCurrencyStore(state => state.currency);
	const ready = useCurrencyStore(state => !state.loading && state.owner === identity);
	const query = useQuery({
		enabled: identity !== null && ready && !pending && !error,
		queryFn: () =>
			consolidateMoney(values, currency, (from, to) =>
				client.fetchQuery({
					queryFn: () => guestRate(date, from, to),
					queryKey: [identity, "display-currency-rate", date, from, to],
					staleTime: 60 * 60 * 1000,
				}),
			),
		queryKey: [identity, "consolidated-money", currency, date, values],
	});
	if (!ready || pending) return <Skeleton className="inline-block h-6 w-32 align-middle" />;
	if (error) return <span>Valores indisponíveis</span>;
	if (query.isPending) return <Skeleton className="inline-block h-6 w-32 align-middle" />;
	if (query.isError) return <span>Conversão indisponível</span>;
	const formatter = createCurrencyFormatter(currency, navigator.languages);
	if (debt === "absolute") return <span>{formatter.format(Math.abs(query.data))}</span>;
	if (debt === "plural" && query.data !== 0) {
		return (
			<>
				<span>{formatter.format(Math.abs(query.data))}</span>
				<span className="block text-sm font-normal opacity-70">
					{query.data > 0 ? "Te devem" : "Você deve"}
				</span>
			</>
		);
	}
	return <span>{formatter.format(query.data)}</span>;
}
