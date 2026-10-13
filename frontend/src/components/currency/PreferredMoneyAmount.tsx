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
}: {
	values: readonly MoneyPosition[];
	date?: string;
	pending?: boolean;
	error?: boolean;
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
	return <span>{createCurrencyFormatter(currency, navigator.languages).format(query.data)}</span>;
}
