import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CollapsibleListingSection } from "@/components/ui/CollapsibleListingSection";
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
	const total = query.data?.length ?? 0;
	const pending = query.data?.filter(item => item.status === "PENDING").length ?? 0;
	return (
		<CollapsibleListingSection
			description="Revise propostas de instituições, perfis e políticas de rendimento."
			summary={
				query.isPending
					? "Carregando quantidade..."
					: query.isError
						? "Quantidade indisponível"
						: `${total} ${total === 1 ? "proposta" : "propostas"} - ${pending} ${pending === 1 ? "pendente" : "pendentes"}`
			}
			title="Revisão institucional"
		>
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
							void queryClient.invalidateQueries({ queryKey: ["admin-institution-catalog"] });
						}}
						proposal={proposal}
					/>
				))
			) : (
				<p>Nenhuma proposta registrada.</p>
			)}
		</CollapsibleListingSection>
	);
}
