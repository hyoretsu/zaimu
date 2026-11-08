import { LuPencil } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { countryName } from "@/lib/countries";
import { InstitutionFormDialog } from "./InstitutionFormDialog";
import type { AdminInstitution } from "./types";

export function InstitutionCatalogRow({ institution }: { institution: AdminInstitution }) {
	return (
		<article className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-4">
			<div className="min-w-0 flex-1 space-y-1">
				<h3 className="font-semibold break-words">{institution.name}</h3>
				{!!institution.aliases?.length && (
					<p className="text-muted-foreground text-sm break-words">
						Também conhecida como {institution.aliases.join(", ")}
					</p>
				)}
				<p className="text-muted-foreground text-sm break-words">Versão {institution.version ?? 1}</p>
				<p className="text-muted-foreground text-sm break-words">
					{institution.operatingCountryCodes?.length
						? institution.operatingCountryCodes.map(code => countryName(code)).join("; ")
						: "Países não informados"}
				</p>
			</div>
			<ActionGroup>
				<InstitutionFormDialog
					institution={institution}
					trigger={
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									aria-label={`Configurar ${institution.name}`}
									size="icon-sm"
									variant="outline"
								>
									<LuPencil />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Configurar instituição</TooltipContent>
						</Tooltip>
					}
				/>
			</ActionGroup>
		</article>
	);
}
