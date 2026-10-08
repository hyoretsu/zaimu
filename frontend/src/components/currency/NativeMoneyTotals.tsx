import { Skeleton } from "@/components/ui/Skeleton";

export function NativeMoneyTotals({
	values,
	pending,
	error,
}: {
	values: Array<{ currency: string; amount: number }>;
	pending: boolean;
	error?: boolean;
}) {
	if (pending) return <Skeleton className="mt-2 h-9 w-40" />;
	if (error) return <p className="mt-2 text-sm">Valores indisponíveis</p>;
	const totals = new Map<string, number>();
	for (const value of values) totals.set(value.currency, (totals.get(value.currency) ?? 0) + value.amount);
	if (!totals.size) return <p className="mt-2 font-bold text-3xl">Sem valores</p>;
	return (
		<div className="mt-2 grid gap-1">
			{[...totals]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([currency, amount]) => (
					<p className="font-bold text-3xl" key={currency}>
						{new Intl.NumberFormat("pt-BR", { currency, style: "currency" }).format(amount)}
					</p>
				))}
		</div>
	);
}
