import { type ReactNode, useState } from "react";
import { InstitutionForm } from "@/components/institution-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/Dialog";
import type { AdminInstitution } from "./types";

/** Admin dialog around the shared institution form; edits publish immediately. */
export function InstitutionFormDialog({
	institution,
	trigger,
}: {
	institution?: AdminInstitution;
	trigger: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{institution ? `Configurar instituição - ${institution.name}` : "Criar instituição"}
					</DialogTitle>
					<DialogDescription>
						Nome, países, fechamento de fatura, regras de cartão, perfis e políticas de rendimento
						em uma única edição, publicada ao salvar.
					</DialogDescription>
				</DialogHeader>
				{open && (
					<InstitutionForm institution={institution} mode="admin" onClose={() => setOpen(false)} />
				)}
			</DialogContent>
		</Dialog>
	);
}
