import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuFileUp } from "react-icons/lu";
import { StatementFilePicker } from "@/components/transaction-imports";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { RequiredMark } from "@/components/ui/RequiredMark";
import type { CreditCard, CreditCardImport } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import {
	creditCardStatementProviderOptions,
	getCreditCardStatementPdfPasswordConfiguration,
} from "@/lib/credit-card-imports";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function ImportCreditCardStatementDialog({
	cards,
	onImported,
	onOpenChange,
	open,
}: {
	cards: CreditCard[];
	onImported: (importId: string) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [creditCardId, setCreditCardId] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [password, setPassword] = useState("");
	const [provider, setProvider] = useState<CreditCardImport["provider"] | "">("");
	const passwordConfiguration = getCreditCardStatementPdfPasswordConfiguration(provider);
	useEffect(() => {
		if (!open) return;
		setCreditCardId(cards.length === 1 ? cards[0]!.id : "");
		setFile(null);
		setPassword("");
		setProvider("");
	}, [cards, open]);
	const createImport = useMutation({
		mutationFn: () => {
			if (!provider) throw new Error("Selecione a instituição da fatura.");
			if (!creditCardId) throw new Error("Selecione o cartão que receberá as compras.");
			if (!file) throw new Error("Selecione uma fatura em PDF.");
			if (passwordConfiguration?.required && !password) throw new Error("Informe a senha do PDF.");
			return dataService.creditCardImports.create({
				creditCardId,
				file,
				password: password || undefined,
				provider,
			});
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			if (!result.creditCardImport) {
				await invalidateCacheOperation(queryClient, identity!, "statement");
				showToast("Fatura sincronizada por completo.", "positive");
				onOpenChange(false);
				return;
			}
			await queryClient.invalidateQueries({
				queryKey: queryKeys.creditCardImports.pending(identity!),
				refetchType: "active",
			});
			onOpenChange(false);
			onImported(result.creditCardImport.id);
			showToast(
				result.ignoredCount
					? `${result.ignoredCount} ${result.ignoredCount === 1 ? "compra já importada foi ignorada" : "compras já importadas foram ignoradas"}.`
					: "Fatura importada para revisão.",
				"positive",
			);
		},
	});

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Importar fatura</DialogTitle>
					<DialogDescription>
						Selecione a instituição da fatura e revise as compras antes de aprovar.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<CustomSelect
						label="Instituição"
						onValueChange={value => setProvider(value as CreditCardImport["provider"])}
						options={creditCardStatementProviderOptions}
						placeholder="Selecione a instituição"
						required
						sortOptions={false}
						value={provider}
					/>
					<CustomSelect
						label="Cartão que receberá as compras"
						onValueChange={setCreditCardId}
						options={cards.map(card => ({ label: getCreditCardDisplayName(card), value: card.id }))}
						placeholder="Selecione o cartão"
						required
						value={creditCardId}
					/>
					<StatementFilePicker
						file={file}
						inputId="credit-card-import-file"
						label="Fatura em PDF"
						onFileChange={setFile}
					/>
					{passwordConfiguration ? (
						<div className="grid gap-2">
							<Label htmlFor="credit-card-import-password">
								<span>Senha do PDF {passwordConfiguration.required ? <RequiredMark /> : "(opcional)"}</span>
							</Label>
							<Input
								autoComplete="off"
								id="credit-card-import-password"
								inputMode="numeric"
								name="credit-card-import-password"
								onChange={event => setPassword(event.currentTarget.value)}
								placeholder={passwordConfiguration.placeholder}
								required={passwordConfiguration.required}
								type="password"
								value={password}
							/>
						</div>
					) : null}
				</div>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={
							!provider ||
							!creditCardId ||
							!file ||
							(passwordConfiguration?.required && !password) ||
							createImport.isPending
						}
						onClick={() => createImport.mutate()}
					>
						<LuFileUp /> {createImport.isPending ? "Importando…" : "Importar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
