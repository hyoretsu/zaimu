import { useState } from "react";
import { LuEllipsis, LuSend, LuTrash2 } from "react-icons/lu";
import { AccountTransferDialog } from "@/components/account-transfers";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import type { FinancialInstitution } from "@/lib/api";
import { InstitutionProfileDialog } from "./InstitutionProfileDialog";

export function InstitutionActions({
	institution,
	onDelete,
}: {
	institution: FinancialInstitution;
	onDelete: (institution: FinancialInstitution) => Promise<unknown>;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [transferOpen, setTransferOpen] = useState(false);
	return (
		<>
			<AccountTransferDialog
				hideTrigger
				institutionId={institution.id}
				onOpenChange={setTransferOpen}
				open={transferOpen}
			/>
			<InstitutionProfileDialog institution={institution} />
			<Popover onOpenChange={setMenuOpen} open={menuOpen}>
				<PopoverTrigger asChild>
					<Button
						aria-label={`Mais ações de ${institution.name}`}
						className="cursor-pointer"
						size="icon-sm"
						variant="outline"
					>
						<LuEllipsis />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="flex w-52 flex-col gap-2 p-2">
					<Button
						className="w-full cursor-pointer justify-start"
						onClick={() => {
							setMenuOpen(false);
							setTransferOpen(true);
						}}
						size="sm"
						variant="outline"
					>
						<LuSend /> Transferir contas
					</Button>
					<ConfirmActionButton
						className="w-full cursor-pointer justify-start"
						confirmation={`Excluir ${institution.name}? Produtos serão mantidos sem instituição.`}
						onConfirm={async () => {
							await onDelete(institution);
						}}
						size="sm"
						variant="destructive"
					>
						<LuTrash2 /> Excluir instituição
					</ConfirmActionButton>
				</PopoverContent>
			</Popover>
		</>
	);
}
