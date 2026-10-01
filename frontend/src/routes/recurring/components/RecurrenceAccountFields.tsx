import { useQuery } from "@tanstack/react-query";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FinancialAccount } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import {
	compareFinancialAccountsByDisplayName,
	getFinancialAccountOptionLabel,
} from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import type { UnifiedRecurringDraft } from "./unified-types";
export function RecurrenceAccountFields({
	accounts,
	draft,
	set,
	disabled = false,
}: {
	accounts: FinancialAccount[];
	draft: UnifiedRecurringDraft;
	disabled?: boolean;
	set: <K extends keyof UnifiedRecurringDraft>(key: K, value: UnifiedRecurringDraft[K]) => void;
}) {
	const balanceOptions = accounts
		.filter(account => ["CHECKING", "SAVINGS", "CASH"].includes(account.type))
		.toSorted(compareFinancialAccountsByDisplayName)
		.map(account => ({ label: getFinancialAccountOptionLabel(account), value: account.id }));
	const identity = useCacheIdentity();
	const needsCard = ["CARD_PURCHASE", "CARD_PAYMENT"].includes(draft.movement);
	const cards = useQuery({
		enabled: identity !== null && needsCard,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
	});
	const cardOptions = (cards.data ?? []).map(card => ({
		label: accounts.find(account => account.id === card.financialAccountId)
			? getFinancialAccountOptionLabel(accounts.find(account => account.id === card.financialAccountId)!)
			: (card.accountName ?? "Cartão"),
		value: card.id,
	}));

	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{["EXPENSE", "TRANSFER", "CARD_PAYMENT"].includes(draft.movement) && (
				<div className="grid gap-2">
					<CustomSelect
						disabled={disabled}
						label="Conta de saída"
						onValueChange={value => set("originFinancialAccountId", value)}
						options={balanceOptions}
						placeholder="Selecione conta de saída"
						required
						searchable
						value={draft.originFinancialAccountId}
					/>
				</div>
			)}
			{["INCOME", "TRANSFER"].includes(draft.movement) && (
				<div className="grid gap-2">
					<CustomSelect
						disabled={disabled}
						label="Conta de entrada"
						onValueChange={value => set("destinationFinancialAccountId", value)}
						options={balanceOptions.filter(
							option => draft.movement !== "TRANSFER" || option.value !== draft.originFinancialAccountId,
						)}
						placeholder="Selecione conta de entrada"
						required
						searchable
						value={draft.destinationFinancialAccountId}
					/>
				</div>
			)}
			{needsCard && (
				<div className="grid gap-2">
					{cards.isPending ? (
						<Skeleton className="h-16 rounded-xl" />
					) : cards.isError ? (
						<p role="alert">Não foi possível carregar cartões.</p>
					) : (
						<CustomSelect
							disabled={disabled}
							label="Cartão"
							onValueChange={value => set("creditCardId", value)}
							options={cardOptions}
							placeholder="Selecione cartão"
							required
							searchable
							value={draft.creditCardId}
						/>
					)}
				</div>
			)}
		</div>
	);
}
