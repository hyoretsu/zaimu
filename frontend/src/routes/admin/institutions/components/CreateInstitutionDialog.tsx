import { LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { InstitutionFormDialog } from "./InstitutionFormDialog";

export function CreateInstitutionDialog() {
	return (
		<InstitutionFormDialog
			trigger={
				<Button>
					<LuPlus />
					Criar instituição
				</Button>
			}
		/>
	);
}
