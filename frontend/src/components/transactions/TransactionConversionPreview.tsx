import { useQuery } from "@tanstack/react-query";
import { roundMoney } from "@zaimu/finance/money";
import { LuCopy } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FinancialFee } from "@/lib/api";
import { convertLocalMoney, guestRate } from "@/lib/currency-conversion";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function TransactionConversionPreview({
	amount,
	sourceCurrency,
	bookingCurrency,
	targetCurrency,
	date,
	fees,
	onUse,
}: {
	amount: string;
	sourceCurrency: string;
	bookingCurrency: string;
	targetCurrency: string;
	date: string;
	fees: FinancialFee[];
	onUse: (value: string) => void;
}) {
	const owner = useCacheIdentity();
	const query = useQuery({
		enabled: !!owner && Number(amount) > 0 && !!date,
		queryFn: async () => {
			const debit = await convertLocalMoney(Number(amount), date, sourceCurrency, bookingCurrency, fees);
			return roundMoney(
				debit.amount * (await guestRate(date, bookingCurrency, targetCurrency)),
				targetCurrency,
			);
		},
		queryKey: [
			"identity",
			owner,
			"transaction-conversion",
			amount,
			sourceCurrency,
			bookingCurrency,
			targetCurrency,
			date,
			fees,
		],
		retry: false,
	});
	if (!Number(amount) || !date) return null;
	if (query.isPending) return <Skeleton className="h-8 w-full" />;
	if (query.isError || query.data == null)
		return (
			<p className="text-muted-foreground text-xs">
				Cotação diária indisponível. Informe valor efetivo para este lado.
			</p>
		);
	const suggested = query.data;
	return (
		<div className="space-y-2">
			<p className="text-muted-foreground text-xs">
				Conversão de {date}:{" "}
				{new Intl.NumberFormat(navigator.languages, { currency: targetCurrency, style: "currency" }).format(
					suggested,
				)}
			</p>
			<ActionGroup>
				<Button
					onClick={() => {
						onUse(String(suggested));
						showToast("Valor sugerido copiado", "info");
					}}
					size="sm"
					type="button"
					variant="outline"
				>
					<LuCopy /> Usar valor sugerido
				</Button>
			</ActionGroup>
		</div>
	);
}
