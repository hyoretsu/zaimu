import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
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
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { postFinancialInstitutionsByIdProfiles } from "@/lib/api";
import { captureCacheMutation, invalidateMutationCache, mutationCacheMeta } from "@/lib/mutation-cache";
import { showToast } from "@/stores";

export function CreateInstitutionProfileDialog({
	institutionId,
	onCreated,
}: {
	institutionId: string;
	onCreated: (name: string) => Promise<void>;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useDebouncedInput("", () => undefined);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	return (
		<Dialog
			onOpenChange={value => {
				if (pending) return;
				if (value) {
					setName("");
					setError("");
				}
				setOpen(value);
			}}
			open={open}
		>
			<DialogTrigger asChild>
				<Button type="button" variant="outline">
					<LuPlus /> Criar perfil
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Criar perfil</DialogTitle>
					<DialogDescription>
						Novo perfil fica disponível após aprovação administrativa.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 flex-1 flex-col gap-5"
					onSubmit={async event => {
						event.preventDefault();
						event.stopPropagation();
						if (pending) return;
						const submitted = String(
							new FormData(event.currentTarget).get("profile-name") ?? "",
						).trim();
						if (!submitted || submitted.length > 100) {
							setError("Informe um nome com até 100 caracteres.");
							return;
						}
						setPending(true);
						setError("");
						try {
							const start = captureCacheMutation();
							await postFinancialInstitutionsByIdProfiles({
								body: { name: submitted },
								path: { id: institutionId },
							}).then(result => result.data);
							await invalidateMutationCache(
								queryClient,
								start,
								mutationCacheMeta("institution"),
							);
							await onCreated(submitted);
							showToast("Perfil enviado para aprovação administrativa", "positive");
							setOpen(false);
						} catch (cause) {
							setError(
								cause instanceof Error ? cause.message : "Não foi possível criar o perfil.",
							);
						} finally {
							setPending(false);
						}
					}}
				>
					<DialogBody>
						<FormField
							disabled={pending}
							id="institution-profile-name"
							label="Nome do perfil"
							maxLength={100}
							name="profile-name"
							onChange={event => setName(event.currentTarget.value)}
							placeholder="Ex: Premium"
							required
							value={name}
						/>
						{error && (
							<p className="text-destructive text-sm" role="alert">
								{error}
							</p>
						)}
					</DialogBody>
					<DialogFooter>
						<Button
							disabled={pending}
							onClick={() => setOpen(false)}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						<Button disabled={pending} type="submit">
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
