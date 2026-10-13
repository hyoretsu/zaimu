import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { DebtPerson } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";

export function EditDebtPersonDialog({
	onOpenChange,
	onSubmit,
	open,
	pending,
	person,
	initialDraft,
	onSaved,
}: {
	onOpenChange: (open: boolean) => void;
	onSubmit: (draft: { accountEmail: string; name: string }) => Promise<void>;
	open: boolean;
	pending: boolean;
	person: DebtPerson;
	initialDraft?: { accountEmail: string; name: string };
	onSaved: () => Promise<unknown>;
}) {
	const [name, setName] = useDebouncedInput(person.name, () => {});
	const [accountEmail, setAccountEmail] = useDebouncedInput(person.accountEmail ?? "", () => {});
	useEffect(() => {
		if (!open) return;
		setName(initialDraft?.name ?? person.name);
		setAccountEmail(initialDraft?.accountEmail ?? person.accountEmail ?? "");
	}, [initialDraft, open, person.accountEmail, person.name, setAccountEmail, setName]);
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Editar pessoa</DialogTitle>
					<DialogDescription>
						Altere o nome ou associe outra conta Zaimu. Limpe o e-mail para desvincular a conta atual.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 gap-5"
					onSubmit={event => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const draft = {
							accountEmail: String(form.get("debt-person-account-email") ?? accountEmail),
							name: String(form.get("debt-person-name") ?? name),
						};
						runBackgroundModalAction({
							close: () => onOpenChange(false),
							conflictKey: `debt-person:${person.id}`,
							failureMessage: "Não foi possível salvar pessoa.",
							loadingMessage: "Salvando pessoa...",
							onSuccess: onSaved,
							recovery: { entityId: person.id, kind: "debt-person", payload: { draft, person } },
							run: () => onSubmit(draft),
							successMessage: "Pessoa atualizada.",
						});
					}}
				>
					<DialogBody>
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
					</DialogBody>
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
