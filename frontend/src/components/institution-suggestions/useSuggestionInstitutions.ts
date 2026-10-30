import { useQuery } from "@tanstack/react-query";
import { dataService } from "@/lib/dataService";
import { useCacheIdentity } from "@/lib/query-cache";

export function useSuggestionInstitutions() {
	const identity = useCacheIdentity();
	return useQuery({
		queryFn: () => dataService.financialInstitutions.getAll(),
		queryKey: ["identity", identity, "suggestion-institutions"],
	});
}
