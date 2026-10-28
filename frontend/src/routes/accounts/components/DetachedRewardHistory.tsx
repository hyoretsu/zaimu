import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import client from "@/lib/api/client-api";
import { useCacheIdentity } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth";

interface RewardPage {
	items: Array<{ id: string; date: string; amount: number }>;
	nextCursor: string | null;
}
export function DetachedRewardHistory({
	accountId,
	currency,
	points,
}: {
	accountId: string;
	currency: string;
	points: boolean;
}) {
	const identity = useCacheIdentity();
	const authenticated = useAuthStore(state => state.isAuthenticated);
	const query = useInfiniteQuery({
		enabled: authenticated,
		getNextPageParam: (last: RewardPage) => last.nextCursor,
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam, signal }) =>
			(
				await client<RewardPage>({
					method: "GET",
					params: pageParam ? { cursor: pageParam } : undefined,
					signal,
					url: `/account-transfers/rewards/${encodeURIComponent(accountId)}`,
				})
			).data,
		queryKey: ["identity", identity, "detached-rewards", accountId],
	});
	if (!authenticated) return null;
	if (query.isPending)
		return (
			<div className="space-y-2">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-14 w-full" />
			</div>
		);
	if (query.isError && !query.data)
		return (
			<div role="alert">
				Não foi possível carregar histórico separado.{" "}
				<Button onClick={() => void query.refetch()} variant="outline">
					Tentar novamente
				</Button>
			</div>
		);
	const items = query.data?.pages.flatMap(page => page.items) ?? [];
	if (!items.length) return null;
	return (
		<section aria-label="Histórico de recompensas separado" className="space-y-3">
			<h3 className="font-semibold">Recompensas - histórico separado</h3>
			{items.map(item => (
				<article
					className="flex flex-wrap justify-between gap-2 rounded-xl border p-3 text-sm"
					key={item.id}
				>
					<span>
						{new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR")} -{" "}
						{item.amount < 0 ? "Estorno" : "Crédito"}
					</span>
					<span>
						{new Intl.NumberFormat(
							"pt-BR",
							points ? { maximumFractionDigits: 4 } : { currency, style: "currency" },
						).format(item.amount)}
						{points ? " pontos" : ""}
					</span>
				</article>
			))}
			{query.hasNextPage && (
				<Button
					disabled={query.isFetchingNextPage}
					onClick={() => void query.fetchNextPage()}
					variant="outline"
				>
					{query.isFetchingNextPage
						? "Carregando..."
						: query.isError
							? "Tentar novamente"
							: "Carregar mais"}
				</Button>
			)}
		</section>
	);
}
