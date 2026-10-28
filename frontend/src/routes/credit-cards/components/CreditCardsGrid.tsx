import { type ComponentProps, memo } from "react";
import type { CreditCard } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { CreditCardManagementActions } from "./CreditCardManagementActions";
import { CreditCardOverviewCard } from "./CreditCardOverviewCard";

type Props = Pick<ComponentProps<typeof CreditCardManagementActions>, "onDelete" | "onHide" | "onUpdate"> & {
	cards: CreditCard[];
	onAddPurchase: (id: string) => void;
	onViewStatements: (id: string) => void;
};

// Modal/pending changes must not rebuild every card's controls and edit dialog.
export const CreditCardsGrid = memo(function CreditCardsGrid({
	cards,
	onAddPurchase,
	onDelete,
	onHide,
	onUpdate,
	onViewStatements,
}: Props) {
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
							card={card}
							onDelete={onDelete}
							onHide={onHide}
							onUpdate={onUpdate}
						/>
					}
					onAddPurchase={() => onAddPurchase(card.id)}
					onViewStatements={() => onViewStatements(card.id)}
				/>
			))}
		</section>
	);
});
