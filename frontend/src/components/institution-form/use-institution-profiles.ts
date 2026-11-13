import { useQuery } from "@tanstack/react-query";
import { getFinancialInstitutionsByIdProfiles } from "@/lib/api";
import { useCacheIdentity } from "@/lib/query-cache";
import type { ExistingProfile } from "./types";

export function useInstitutionProfiles(institutionId?: string) {
	const identity = useCacheIdentity();
	return useQuery({
		enabled: !!institutionId,
		queryFn: () =>
			getFinancialInstitutionsByIdProfiles({ path: { id: institutionId! } }).then(
				result => result.data as ExistingProfile[],
			),
		queryKey: ["identity", identity, "institution-profiles", institutionId],
	});
}
