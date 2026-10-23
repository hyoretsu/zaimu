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
import { postFinancialInstitutions } from "@/lib/api";
import { captureCacheMutation, invalidateMutationCache, mutationCacheMeta } from "@/lib/mutation-cache";
import { showToast } from "@/stores";

export function CreateInstitutionDialog() {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [name, setName] = useState("");
	const [input, setInput] = useDebouncedInput(name, setName);
	const [error, setError] = useState("");
	const save = async (submittedName: string) => {
		if (pending) return;
		const trimmedName = submittedName.trim();
		if (!trimmedName || trimmedName.length > 100) {
			setError("Informe um nome com até 100 caracteres.");
			return;
		}
		const start = captureCacheMutation();
		setPending(true);
		setError("");
		try {
			await postFinancialInstitutions({ name: trimmedName });
			await invalidateMutationCache(queryClient, start, {
				...mutationCacheMeta("institution"),
				awaitRefetch: true,
			});
			showToast("Instituição criada e publicada no catálogo.", "positive");
			setOpen(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Não foi possível criar a instituição.");
		} finally {
			setPending(false);
		}
	};
	return (
		<Dialog
			onOpenChange={value => {
				if (pending) return;
				if (value) {
					setInput("");
					setName("");
					setError("");
				}
				setOpen(value);
			}}
			open={open}
		>
			<DialogTrigger asChild>
				<Button>
					<LuPlus />
					Criar instituição
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Criar instituição</DialogTitle>
					<DialogDescription>
						Cadastre o nome e aprove a proposta na revisão institucional. Após publicar, configure países,
						moedas e benefícios no catálogo global.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
					onSubmit={event => {
						event.preventDefault();
						const data = new FormData(event.currentTarget);
						void save(String(data.get("institution-name") ?? ""));
					}}
				>
					<DialogBody>
						<FormField
							disabled={pending}
							error={error}
							id="new-institution-name"
							label="Nome da instituição"
							maxLength={100}
							name="institution-name"
							onChange={event => setInput(event.currentTarget.value)}
							placeholder="Ex: Banco Inter"
							required
							type="text"
							value={input}
						/>
						{error && (
							<p className="text-destructive text-sm" role="alert">
								{error}
							</p>
						)}
						{pending && <p role="status">Criando instituição...</p>}
					</DialogBody>
					<DialogFooter>
						<Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">
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
