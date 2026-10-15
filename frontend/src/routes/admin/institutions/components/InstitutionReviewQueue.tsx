import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchWithAuth } from "@/lib/dataService";
import { useAuthStore } from "@/stores/auth";
import { InstitutionProposalRow } from "./InstitutionProposalRow";
export interface InstitutionProposal {
	id: string;
	kind: string;
	status: string;
	name: string | null;
	authorId: string;
	institutionId: string | null;
	baseVersion: number | null;
	version: number | null;
	effectiveDate: string | null;
	reason: string | null;
	payload: Record<string, unknown>;
	createdAt: string;
}
export function InstitutionReviewQueue() {
	const queryClient = useQueryClient();
	const userId = useAuthStore(state => state.user?.id);
	const query = useQuery({
		queryFn: () => fetchWithAuth<InstitutionProposal[]>("/financial-institutions/review/proposals"),
		queryKey: ["institution-review", userId],
	});
	return (
		<section className="grid min-w-0 gap-4 rounded-2xl border bg-card p-4 sm:p-6">
			<h2 className="font-semibold text-lg">
				Revisão institucional{" "}
				{query.data ? `(${query.data.filter(item => item.status === "PENDING").length} pendentes)` : ""}
			</h2>
			{query.isPending ? (
				<div className="space-y-3">
					<Skeleton className="h-28 w-full" />
					<Skeleton className="h-28 w-full" />
				</div>
			) : query.isError ? (
				<p role="alert">{query.error.message}</p>
			) : query.data?.length ? (
				query.data.map(proposal => (
					<InstitutionProposalRow
						key={proposal.id}
						onReviewed={() => {
							void query.refetch();
							void queryClient.invalidateQueries({ queryKey: ["institutions"] });
						}}
						proposal={proposal}
					/>
				))
			) : (
				<p>Nenhuma proposta registrada.</p>
			)}
		</section>
	);
}
