import { useState } from "react";
import { DebtPersonPicker } from "@/components/debts";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";

export function DebtInvitationAssociationDialog({
	onApprove,
	onOpenChange,
	open,
	pending,
}: {
	onApprove: (personId?: string) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	pending: boolean;
}) {
	const [associationMode, setAssociationMode] = useState<"existing" | "new">("new");
	const [personId, setPersonId] = useState("");
	const reusePerson = associationMode === "existing";
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Associar pessoa</DialogTitle>
					<DialogDescription>
						Crie uma nova pessoa para esta dívida ou associe o convite a uma pessoa já cadastrada.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 rounded-2xl border bg-muted/30 p-4">
					<CustomSelect
						disabled={pending}
						label="Associar como"
						onValueChange={value => {
							setAssociationMode(value as "existing" | "new");
							setPersonId("");
						}}
						options={[
							{ label: "Criar nova pessoa", value: "new" },
							{ label: "Usar pessoa existente", value: "existing" },
						]}
						placeholder="Selecione como associar"
						value={associationMode}
					/>
					{reusePerson ? <DebtPersonPicker onValueChange={setPersonId} required value={personId} /> : null}
				</div>
				<DialogFooter>
					<Button
						className="cursor-pointer"
						disabled={pending}
						onClick={() => onOpenChange(false)}
						type="button"
						variant="outline"
					>
						Cancelar
					</Button>
					<Button
						className="cursor-pointer"
						disabled={pending || (reusePerson && !personId)}
						onClick={() => onApprove(reusePerson ? personId : undefined)}
						type="button"
					>
						Aprovar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
