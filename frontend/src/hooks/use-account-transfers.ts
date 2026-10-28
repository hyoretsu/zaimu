import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ownershipTransfers } from "@/lib/api/account-transfers";
import { useCacheIdentity } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth";

export function useAccountTransfers() {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const authenticated = useAuthStore(state => state.isAuthenticated);
	return useQuery({
		enabled: authenticated,
		queryFn: async ({ signal }) => {
			const result = await ownershipTransfers.list(signal);
			const previous = queryClient.getQueryData<Awaited<ReturnType<typeof ownershipTransfers.list>>>([
				"identity",
				identity,
				"account-transfers",
			]);
			if (
				result.some(
					row =>
						row.status === "ACCEPTED" &&
						!previous?.some(old => old.id === row.id && old.status === "ACCEPTED"),
				)
			)
				await queryClient.invalidateQueries({
					predicate: query =>
						query.queryKey[0] === "identity" &&
						query.queryKey[1] === identity &&
						query.queryKey[2] !== "account-transfers",
				});
			return result;
		},
		queryKey: ["identity", identity, "account-transfers"],
		refetchInterval: 30000,
		retry: false,
	});
}
