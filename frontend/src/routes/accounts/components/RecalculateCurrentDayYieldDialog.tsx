import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";

export function RecalculateCurrentDayYieldDialog({
	onOpenChange,
	onRecalculate,
	onSkip,
	open,
}: {
	onOpenChange: (open: boolean) => void;
	onRecalculate: () => void;
	onSkip: () => void;
	open: boolean;
}) {
	return (
		<Dialog modal onOpenChange={onOpenChange} open={open}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Recalcular o rendimento de hoje?</DialogTitle>
					<DialogDescription>
						As novas taxas passam a valer amanhã. Se recalcular hoje, ajustes ou exclusões do rendimento
						automático de hoje serão removidos.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={onSkip} variant="outline">
						Manter a partir de amanhã
					</Button>
					<Button className="cursor-pointer" onClick={onRecalculate}>
						Recalcular hoje
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
