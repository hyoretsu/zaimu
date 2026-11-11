import { useQuery } from "@tanstack/react-query";
import { CollapsibleListingSection } from "@/components/ui/CollapsibleListingSection";
import { Skeleton } from "@/components/ui/Skeleton";
import { getFinancialInstitutionsReviewProposals } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { InstitutionProposalRow } from "./InstitutionProposalRow";
export type InstitutionProposal = Awaited<
	ReturnType<typeof getFinancialInstitutionsReviewProposals>
>["data"][number];
const duplicateReason = /duplicad?a|duplicate/i;
// Reviewed proposals disappear on their own: approved/associated ones, rejected duplicates and
// reviewed ones already outdated by a newer institution version.
function isResolvedNoise(item: InstitutionProposal) {
	if (item.status === "PENDING") return false;
	if (item.status === "APPROVED" || item.status === "ASSOCIATED") return true;
	const outdated = item.baseVersion !== null && item.version !== null && item.baseVersion < item.version;
	return outdated || duplicateReason.test(item.reason ?? "");
}
export function InstitutionReviewQueue() {
	const userId = useAuthStore(state => state.user?.id);
	const query = useQuery({
		queryFn: () => getFinancialInstitutionsReviewProposals({}).then(result => result.data),
		queryKey: ["institution-review", userId],
	});
	const proposals = query.data?.filter(item => !isResolvedNoise(item));
	const total = proposals?.length ?? 0;
	const pending = proposals?.filter(item => item.status === "PENDING").length ?? 0;
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
			) : proposals?.length ? (
				proposals.map(proposal => <InstitutionProposalRow key={proposal.id} proposal={proposal} />)
			) : (
				<p>Nenhuma proposta registrada.</p>
			)}
		</CollapsibleListingSection>
	);
}
