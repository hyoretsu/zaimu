import { LuTrash2 } from "react-icons/lu";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { FinancialInstitution } from "@/lib/api";
import { EditInstitutionDialog } from "./EditInstitutionDialog";
import { InstitutionProfileDialog } from "./InstitutionProfileDialog";

export function InstitutionActions({
	institution,
	onDelete,
	onUpdate,
}: {
	institution: FinancialInstitution;
	onDelete: (institution: FinancialInstitution) => Promise<unknown>;
	onUpdate: Parameters<typeof EditInstitutionDialog>[0]["onUpdate"];
}) {
	return (
		<>
			<InstitutionProfileDialog institution={institution} />
			<EditInstitutionDialog institution={institution} onUpdate={onUpdate} />
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex">
						<ConfirmActionButton
							aria-label={`Excluir ${institution.name}`}
							className="cursor-pointer"
							confirmation={`Excluir ${institution.name}? Produtos serão mantidos sem instituição.`}
							onConfirm={async () => {
								await onDelete(institution);
							}}
							size="icon-sm"
							variant="destructive"
						>
							<LuTrash2 />
						</ConfirmActionButton>
					</span>
				</TooltipTrigger>
				<TooltipContent>Excluir instituição</TooltipContent>
			</Tooltip>
		</>
	);
}
