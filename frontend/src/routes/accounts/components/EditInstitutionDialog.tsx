import { useState } from "react";
import { LuPencil } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { FinancialInstitution } from "@/lib/api";
import { runDialogSave } from "@/lib/dialog-save";

export function EditInstitutionDialog({
	institution,
	onUpdate,
}: {
	institution: FinancialInstitution;
	onUpdate: (institution: FinancialInstitution, name: string) => Promise<unknown>;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useDebouncedInput(institution.name, () => undefined);
	const save = () => {
		try {
			runDialogSave(onUpdate(institution, name.trim()), () => setOpen(false), "Salvando instituição");
		} catch {
			return;
		}
	};
	return (
		<Dialog
			onOpenChange={value => {
				if (value) {
					setName(institution.name);
				}
				setOpen(value);
			}}
			open={open}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							aria-label={`Editar ${institution.name}`}
							className="cursor-pointer"
							size="icon-sm"
							variant="outline"
						>
							<LuPencil />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Editar instituição</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Editar instituição</DialogTitle>
					<DialogDescription>
						Altere o nome da instituição. Alterações aguardam revisão administrativa.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
					onSubmit={event => {
						event.preventDefault();
						save();
					}}
				>
					<DialogBody>
						<FormFieldRow>
							<FormField
								autoComplete="organization"
								id={`institution-${institution.id}`}
								label="Nome da instituição"
								name="institution-name"
								onChange={event => setName(event.currentTarget.value)}
								placeholder="Ex: Mercado Pago"
								required
								type="text"
								value={name}
							/>
						</FormFieldRow>
					</DialogBody>
					<DialogFooter>
						<Button className="cursor-pointer" onClick={() => setOpen(false)} type="button" variant="outline">
							Descartar
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={!name.trim()}
							type="submit"
						>
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
