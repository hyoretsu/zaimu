import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuFileUp } from "react-icons/lu";
import { StatementFilePicker } from "@/components/transaction-imports";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
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
import { Label } from "@/components/ui/Label";
import type { CreditCard } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { getCreditCardStatementPdfPasswordConfiguration } from "@/lib/credit-card-imports";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

import {
	getCreditCardImportInstitution,
	getCreditCardImportProvider,
	getSelectableImportCards,
} from "./credit-card-import-institutions";

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
	const [institutionId, setInstitutionId] = useState("");
	const accounts = useQuery({
		enabled: identity !== null && open,
		queryFn: dataService.accounts.getAll,
		queryKey: queryKeys.accounts.list(identity!),
	});
	const institutions = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.financialInstitutions.getAll(),
		queryKey: ["institutions", identity],
	});
	const accountList = accounts.data ?? [];
	const selectableCards = getSelectableImportCards(cards, accountList, institutionId);
	const selectedInstitution = institutions.data?.find(institution => institution.id === institutionId);
	const provider = getCreditCardImportProvider(selectedInstitution) ?? "";
	const selectedCard = selectableCards.find(card => card.id === creditCardId);
	const selectCard = (id: string) => {
		setCreditCardId(id);
		const card = cards.find(card => card.id === id);
		if (card) setInstitutionId(getCreditCardImportInstitution(card, accountList)?.id ?? "");
	};
	const passwordConfiguration = getCreditCardStatementPdfPasswordConfiguration(provider);
	useEffect(() => {
		if (!open) return;
		setCreditCardId("");
		setFile(null);
		setPassword("");
		setInstitutionId("");
	}, [open]);
	const createImport = useMutation({
		meta: { cacheOperations: ["statement"] },
		mutationFn: () => {
			if (!provider) throw new Error("Selecione a instituição da fatura.");
			if (!creditCardId) throw new Error("Selecione o cartão que receberá as compras.");
			if (
				!selectedCard ||
				getCreditCardImportProvider(getCreditCardImportInstitution(selectedCard, accountList)) !== provider
			) {
				throw new Error("Selecione um cartão da instituição da fatura.");
			}
			if (!file) throw new Error("Selecione uma fatura em PDF.");
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
				<DialogBody>
					<div className="grid gap-4">
						<CustomSelect
							isLoading={institutions.isPending || accounts.isPending}
							label="Instituição"
							onValueChange={value => {
								setInstitutionId(value);
								const card = cards.find(card => card.id === creditCardId);
								if (!card || getCreditCardImportInstitution(card, accountList)?.id !== value)
									setCreditCardId("");
							}}
							options={(institutions.data ?? [])
								.filter(institution => getCreditCardImportProvider(institution))
								.map(institution => ({ label: institution.name, value: institution.id }))}
							placeholder="Selecione a instituição"
							required
							searchable
							sortOptions={false}
							value={institutionId}
						/>
						<CustomSelect
							isLoading={accounts.isPending || institutions.isPending}
							label="Cartão que receberá as compras"
							onValueChange={selectCard}
							options={selectableCards.map(card => ({
								label: getCreditCardDisplayName(card),
								value: card.id,
							}))}
							placeholder="Selecione o cartão"
							required
							searchable
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
								<Label htmlFor="credit-card-import-password">Senha do PDF</Label>
								<Input
									autoComplete="off"
									id="credit-card-import-password"
									inputMode="numeric"
									name="credit-card-import-password"
									onChange={event => setPassword(event.currentTarget.value)}
									placeholder={passwordConfiguration.placeholder}
									type="password"
									value={password}
								/>
							</div>
						) : null}
					</div>
				</DialogBody>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={
							!provider ||
							!selectedCard ||
							!file ||
							accounts.isPending ||
							institutions.isPending ||
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
