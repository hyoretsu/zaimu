import { LuTrash2 } from "react-icons/lu";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CreditCard, FinancialAccount, FinancialInstitution } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import type { FinancialAccountUpdateDraft } from "@/lib/dataService";
import { CreateFinancialAccountDialog } from "../../accounts/components";

export function CreditCardManagementActions({
	account,
	accountsPending,
	card,
	institutions,
	onDelete,
	onUpdate,
	rewardAccounts,
}: {
	account?: FinancialAccount;
	accountsPending: boolean;
	card: CreditCard;
	institutions: FinancialInstitution[];
	onDelete: (accountId: string) => Promise<unknown>;
	onUpdate: (accountId: string, data: FinancialAccountUpdateDraft) => Promise<unknown>;
	rewardAccounts: FinancialAccount[];
}) {
	if (accountsPending) return <Skeleton className="h-8 w-20 bg-white/20" />;
	if (!account) return null;
	return (
		<>
			<CreateFinancialAccountDialog
				account={account}
				cardOnly
				contextual
				iconOnly
				institutions={institutions}
				onCreate={async () => undefined}
				onUpdate={onUpdate}
				pending={false}
				rewardAccounts={rewardAccounts}
			/>
			<ConfirmActionButton
				aria-label={`Excluir ${getCreditCardDisplayName(card)}`}
				confirmation={`Excluir ${getCreditCardDisplayName(card)} permanentemente?`}
				onConfirm={async () => {
					await onDelete(account.id);
				}}
				size="icon-sm"
				variant="destructive"
			>
				<LuTrash2 />
			</ConfirmActionButton>
		</>
	);
}
