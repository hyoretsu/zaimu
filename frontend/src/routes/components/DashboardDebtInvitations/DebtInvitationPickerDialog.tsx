import { LuClock3, LuFileSearch } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { DebtInvitation } from "@/lib/api";
import { compareDebtPersonNames } from "@/lib/debt-split";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export function DebtInvitationPickerDialog({
	invitations,
	onOpenChange,
	onSelect,
	open,
}: {
	invitations: DebtInvitation[];
	onOpenChange: (open: boolean) => void;
	onSelect: (invitationId: string) => void;
	open: boolean;
}) {
	const sortedInvitations = invitations.toSorted((left, right) =>
		compareDebtPersonNames(left.counterpartyName, right.counterpartyName),
	);
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Selecionar convite de dívida</DialogTitle>
					<DialogDescription>Revise o saldo e os lançamentos antes de associar uma pessoa.</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 min-w-0">
					<div className="min-w-0 space-y-2">
						{sortedInvitations.map(invitation => (
							<Button
								className="h-auto w-full min-w-0 max-w-full cursor-pointer justify-start gap-3 overflow-hidden whitespace-normal px-4 py-3 text-left"
								key={invitation.id}
								onClick={() => {
									onOpenChange(false);
									onSelect(invitation.id);
								}}
								variant="outline"
							>
								<LuFileSearch className="mt-0.5 size-5 shrink-0 text-amber-700" />
								<span className="w-0 min-w-0 flex-1 space-y-1 overflow-hidden">
									<span className="block truncate font-semibold">{invitation.counterpartyName}</span>
									<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
										<LuClock3 className="size-3.5 shrink-0" />
										<span className="min-w-0 truncate">
											{dateFormatter.format(new Date(invitation.createdAt))}
										</span>
									</span>
								</span>
							</Button>
						))}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
