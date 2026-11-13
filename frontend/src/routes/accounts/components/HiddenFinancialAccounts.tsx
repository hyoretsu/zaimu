import { CollapsibleListingSection } from "@/components/ui/CollapsibleListingSection";
import type { FinancialAccount, FinancialInstitution } from "@/lib/api";
import { compareFinancialAccountsByTitle } from "@/lib/financial-account";
import { FinancialAccountCard } from "./FinancialAccountCard";

export function HiddenFinancialAccounts({
	accounts,
	institutions,
	onDelete,
	onToggleHidden,
	onUpdate,
	rewardAccounts,
}: {
	accounts: FinancialAccount[];
	institutions: FinancialInstitution[];
	onDelete: (account: FinancialAccount) => void | Promise<void>;
	onToggleHidden: (account: FinancialAccount) => void;
	onUpdate: Parameters<typeof FinancialAccountCard>[0]["onUpdate"];
	rewardAccounts: FinancialAccount[];
}) {
	if (!accounts.length) return null;
	return (
		<CollapsibleListingSection
			containedScroll={false}
			summary={`${accounts.length} ${accounts.length === 1 ? "conta" : "contas"}`}
			title="Contas escondidas"
		>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{accounts.toSorted(compareFinancialAccountsByTitle).map(account => (
					<FinancialAccountCard
						account={account}
						institutionName={
							institutions.find(institution => institution.id === account.institutionId)
								?.name ?? "Sem instituição"
						}
						institutions={institutions}
						key={account.id}
						onDelete={() => onDelete(account)}
						onHide={() => onToggleHidden(account)}
						onUpdate={onUpdate}
						rewardAccounts={rewardAccounts}
					/>
				))}
			</div>
		</CollapsibleListingSection>
	);
}
