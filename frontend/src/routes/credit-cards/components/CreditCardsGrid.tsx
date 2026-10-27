import { type ComponentProps, memo } from "react";
import type { CreditCard, FinancialAccount } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { getFinancialInstitutions } from "@/lib/financial-institution";
import { CreditCardManagementActions } from "./CreditCardManagementActions";
import { CreditCardOverviewCard } from "./CreditCardOverviewCard";

type Props = Pick<
	ComponentProps<typeof CreditCardManagementActions>,
	"accountsPending" | "onDelete" | "onHide" | "onUpdate"
> & {
	accounts?: FinancialAccount[];
	cards: CreditCard[];
	onAddPurchase: (id: string) => void;
	onViewStatements: (id: string) => void;
};

// Modal/pending changes must not rebuild every card's controls and edit dialog.
export const CreditCardsGrid = memo(function CreditCardsGrid({
	accounts,
	accountsPending,
	cards,
	onAddPurchase,
	onDelete,
	onHide,
	onUpdate,
	onViewStatements,
}: Props) {
	const accountById = new Map(accounts?.map(account => [account.id, account]));
	const institutions = getFinancialInstitutions(accounts ?? []);
	const rewardAccounts = accounts?.filter(account => account.type === "REWARDS" && !account.isHidden) ?? [];
	const sortedCards = cards.toSorted((first, second) =>
		getCreditCardDisplayName(first).localeCompare(getCreditCardDisplayName(second), "pt-BR", {
			sensitivity: "base",
		}),
	);
	return (
		<section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
			{sortedCards.map(card => (
				<CreditCardOverviewCard
					card={card}
					key={card.id}
					managementActions={
						<CreditCardManagementActions
							account={accountById.get(card.financialAccountId)}
							accountsPending={accountsPending}
							card={card}
							institutions={institutions}
							onDelete={onDelete}
							onHide={onHide}
							onUpdate={onUpdate}
							rewardAccounts={rewardAccounts}
						/>
					}
					onAddPurchase={() => onAddPurchase(card.id)}
					onViewStatements={() => onViewStatements(card.id)}
				/>
			))}
		</section>
	);
});
