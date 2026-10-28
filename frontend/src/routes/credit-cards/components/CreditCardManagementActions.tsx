import { LuEyeOff, LuTrash2 } from "react-icons/lu";
import { AccountTransferDialog } from "@/components/account-transfers";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { CreditCard } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import type { FinancialAccountUpdateDraft } from "@/lib/dataService";
import { CreditCardEditor } from "./CreditCardEditor";

export function CreditCardManagementActions({
	card,
	onDelete,
	onHide,
	onUpdate,
}: {
	card: CreditCard;
	onDelete: (accountId: string) => Promise<unknown>;
	onHide: (accountId: string) => Promise<unknown>;
	onUpdate: (accountId: string, data: FinancialAccountUpdateDraft) => Promise<unknown>;
}) {
	return (
		<>
			<AccountTransferDialog accountId={card.financialAccountId} iconOnly />
			<CreditCardEditor
				accountId={card.financialAccountId}
				name={getCreditCardDisplayName(card)}
				onUpdate={onUpdate}
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						aria-label={`Esconder ${getCreditCardDisplayName(card)}`}
						className="cursor-pointer"
						onClick={() => void onHide(card.financialAccountId)}
						size="icon-sm"
						variant="outline"
					>
						<LuEyeOff />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Esconder cartão</TooltipContent>
			</Tooltip>
			<ConfirmActionButton
				aria-label={`Excluir ${getCreditCardDisplayName(card)}`}
				confirmation={`Excluir ${getCreditCardDisplayName(card)} permanentemente?`}
				onConfirm={async () => {
					await onDelete(card.financialAccountId);
				}}
				size="icon-sm"
				variant="destructive"
			>
				<LuTrash2 />
			</ConfirmActionButton>
		</>
	);
}
