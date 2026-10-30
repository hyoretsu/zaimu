import { useState } from "react";
import { LuBadgePercent } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/Dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { FinancialInstitution, FinancialInstitutionYieldPolicy } from "@/lib/api";
import { InstitutionYieldEditor } from "./InstitutionYieldEditor";

export function InstitutionYieldDialog({
	institution,
	onUpdate,
}: {
	institution: FinancialInstitution;
	onUpdate: (
		institution: FinancialInstitution,
		policy: Omit<FinancialInstitutionYieldPolicy, "effectiveDate">,
	) => Promise<unknown>;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							aria-label={`Rendimento de ${institution.name}`}
							size="icon-sm"
							variant="outline"
						>
							<LuBadgePercent />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Rendimento</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Rendimento padrão de {institution.name}</DialogTitle>
					<DialogDescription>
						Aplicado por faixas progressivas em contas correntes e poupanças sem regra própria.
					</DialogDescription>
				</DialogHeader>
				{open && (
					<InstitutionYieldEditor
						institution={institution}
						onClose={() => setOpen(false)}
						onUpdate={onUpdate}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
