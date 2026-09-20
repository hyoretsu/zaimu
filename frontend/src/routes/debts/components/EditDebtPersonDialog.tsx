import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { DebtPerson } from "@/lib/api";

export function EditDebtPersonDialog({
	onOpenChange,
	onSubmit,
	open,
	pending,
	person,
}: {
	onOpenChange: (open: boolean) => void;
	onSubmit: (draft: { accountEmail: string; name: string }) => Promise<void>;
	open: boolean;
	pending: boolean;
	person: DebtPerson;
}) {
	const [name, setName] = useDebouncedInput(person.name, () => {});
	const [accountEmail, setAccountEmail] = useDebouncedInput(person.accountEmail ?? "", () => {});
	useEffect(() => {
		if (!open) return;
		setName(person.name);
		setAccountEmail(person.accountEmail ?? "");
	}, [open, person.accountEmail, person.name, setAccountEmail, setName]);
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Editar pessoa</DialogTitle>
					<DialogDescription>
						Altere o nome ou associe outra conta Zaimu. Limpe o e-mail para desvincular a conta atual.
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-4"
					onSubmit={event => {
						event.preventDefault();
						void onSubmit({ accountEmail, name });
					}}
				>
					<label className="grid gap-2 font-medium" htmlFor="debt-person-name">
						<span>
							Nome <span className="text-destructive">*</span>
						</span>
						<Input
							autoComplete="name"
							id="debt-person-name"
							name="debt-person-name"
							onChange={event => setName(event.currentTarget.value)}
							placeholder="Ex: Breno Lima"
							required
							value={name}
						/>
					</label>
					<label className="grid gap-2 font-medium" htmlFor="debt-person-account-email">
						<span>Conta Zaimu</span>
						<Input
							autoComplete="email"
							id="debt-person-account-email"
							inputMode="email"
							name="debt-person-account-email"
							onChange={event => setAccountEmail(event.currentTarget.value)}
							placeholder="Ex: pessoa@email.com"
							type="text"
							value={accountEmail}
						/>
					</label>
					<DialogFooter>
						<Button
							className="cursor-pointer"
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						<Button className="cursor-pointer" disabled={!name.trim() || pending} type="submit">
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
