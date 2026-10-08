import { LuTrash2 } from "react-icons/lu";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { FinancialInstitution, FinancialInstitutionYieldPolicy } from "@/lib/api";
import { EditInstitutionDialog } from "./EditInstitutionDialog";
import { InstitutionYieldDialog } from "./InstitutionYieldDialog";

export function InstitutionActions({
	institution,
	onDelete,
	onUpdate,
	onUpdateYield,
}: {
	institution: FinancialInstitution;
	onDelete: (institution: FinancialInstitution) => Promise<unknown>;
	onUpdate: (institution: FinancialInstitution, name: string, currency: string) => Promise<unknown>;
	onUpdateYield: (
		institution: FinancialInstitution,
		policy: Omit<FinancialInstitutionYieldPolicy, "effectiveDate">,
	) => Promise<unknown>;
}) {
	return (
		<>
			<InstitutionYieldDialog institution={institution} onUpdate={onUpdateYield} />
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
