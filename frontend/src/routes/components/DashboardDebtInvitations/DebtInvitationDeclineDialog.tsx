import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";

export function DebtInvitationDeclineDialog({
	onDecline,
	onDismiss,
	open,
	pending,
}: {
	onDecline: () => void;
	onDismiss: () => void;
	open: boolean;
	pending: boolean;
}) {
	return (
		<Dialog onOpenChange={nextOpen => !nextOpen && onDismiss()} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Recusar convite?</DialogTitle>
					<DialogDescription>
						Você pode fechar agora e manter o convite pendente, ou recusá-lo definitivamente.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						className="cursor-pointer"
						disabled={pending}
						onClick={onDismiss}
						type="button"
						variant="outline"
					>
						Fechar sem recusar
					</Button>
					<Button
						className="cursor-pointer"
						disabled={pending}
						onClick={onDecline}
						type="button"
						variant="destructive"
					>
						Recusar convite
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
