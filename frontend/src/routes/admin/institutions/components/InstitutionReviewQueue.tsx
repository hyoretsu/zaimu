import { useQuery } from "@tanstack/react-query";
import { CollapsibleListingSection } from "@/components/ui/CollapsibleListingSection";
import { Skeleton } from "@/components/ui/Skeleton";
import { getFinancialInstitutionsReviewProposals } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { InstitutionProposalRow } from "./InstitutionProposalRow";
export type InstitutionProposal = Awaited<ReturnType<typeof getFinancialInstitutionsReviewProposals>>[number];
export function InstitutionReviewQueue() {
	const userId = useAuthStore(state => state.user?.id);
	const query = useQuery({
		queryFn: () => getFinancialInstitutionsReviewProposals(),
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
				query.data.map(proposal => <InstitutionProposalRow key={proposal.id} proposal={proposal} />)
			) : (
				<p>Nenhuma proposta registrada.</p>
			)}
		</CollapsibleListingSection>
	);
}
