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
import { creditCardStatementPdfPasswordPlaceholder } from "@/lib/credit-card-imports";
import { dataService } from "@/lib/dataService";
import { institutionOption } from "@/lib/financial-institution";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { statementLabel } from "@/lib/statement-label";
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
	const [statementId, setStatementId] = useState("new");
	const statements = useQuery({
		enabled: open && !!creditCardId && identity !== null,
		queryFn: () => dataService.creditCards.getStatements(creditCardId),
		queryKey: [...queryKeys.creditCardStatements.list(identity!, creditCardId), "import-target"],
	});
	const [files, setFiles] = useState<File[]>([]);
	const [fileErrors, setFileErrors] = useState<string[]>([]);
	const [progress, setProgress] = useState({ completed: 0, total: 0 });
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
		setStatementId("new");
		const card = cards.find(card => card.id === id);
		if (card) setInstitutionId(getCreditCardImportInstitution(card, accountList)?.id ?? "");
	};
	useEffect(() => {
		if (!open) return;
		setCreditCardId("");
		setStatementId("new");
		setFiles([]);
		setFileErrors([]);
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
				getCreditCardImportProvider(getCreditCardImportInstitution(selectedCard, accountList)) !==
					provider
			) {
				throw new Error("Selecione um cartão da instituição da fatura.");
			}
			if (!files.length) throw new Error("Selecione uma fatura em PDF.");
			return dataService.creditCardImports.createBatch({
				creditCardId,
				files,
				onProgress: setProgress,
				password: password || undefined,
				provider,
				statementId: statementId === "new" ? undefined : statementId,
			});
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			const failures = result.results.filter(item => !item.success);
			setFileErrors(failures.map(item => `${item.index + 1}. ${item.fileName}: ${item.error}`));
			setFiles(current =>
				current.filter((file, index) =>
					failures.some(item => item.index === index && item.fileName === file.name),
				),
			);
			await queryClient.invalidateQueries({
				queryKey: queryKeys.creditCardImports.pending(identity!),
				refetchType: "active",
			});
			if (failures.length) {
				showToast(
					`${result.results.length - failures.length} arquivo(s) importado(s). Tente novamente apenas os arquivos com erro.`,
					"negative",
				);
				return;
			}
			onOpenChange(false);
			// Only open the review automatically for a single file; with several, the user picks from the pending list.
			const imported = result.results.find(item => item.importId);
			if (result.results.length === 1 && imported?.importId) onImported(imported.importId);
			showToast(
				imported
					? "Importação concluída. Revise cada arquivo antes de aprovar."
					: "Arquivos sincronizados por completo.",
				"positive",
			);
		},
	});

	return (
		<Dialog
			onOpenChange={value => {
				if (!createImport.isPending) onOpenChange(value);
			}}
			open={open}
		>
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
							disabled={createImport.isPending}
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
								.map(institutionOption)}
							placeholder="Selecione a instituição"
							required
							searchable
							sortOptions={false}
							value={institutionId}
						/>
						<CustomSelect
							disabled={createImport.isPending}
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
						<CustomSelect
							disabled={createImport.isPending}
							isLoading={!!creditCardId && statements.isPending}
							label="Destino do calendário"
							onValueChange={setStatementId}
							options={[
								{
									label: "Identificar pelas datas ou criar nova fatura",
									special: true,
									value: "new",
								},
								...(statements.data ?? [])
									.filter(item => !item.isForecast)
									.map(item => ({
										label: statementLabel(item, statements.data ?? []),
										value: item.id,
									})),
							]}
							placeholder="Ex: Outubro/2024 - vence 08/10"
							searchable
							value={statementId}
						/>
						{createImport.isPending && (
							<p className="text-muted-foreground text-sm" role="status">
								Processando arquivos: {progress.completed} de {progress.total || files.length}
								. Aguarde os jobs de importação.
							</p>
						)}
						<StatementFilePicker
							disabled={createImport.isPending}
							files={files}
							inputId="credit-card-import-file"
							label="Fatura em PDF"
							onFilesChange={value => {
								setFiles(value);
								setFileErrors([]);
							}}
						/>
						{fileErrors.map((error, index) => (
							<p className="text-destructive text-sm" key={index} role="alert">
								{error}
							</p>
						))}
						<div className="grid gap-2">
							<Label htmlFor="credit-card-import-password">Senha do PDF</Label>
							<Input
								autoComplete="off"
								id="credit-card-import-password"
								inputMode="numeric"
								name="credit-card-import-password"
								onChange={event => setPassword(event.currentTarget.value)}
								placeholder={creditCardStatementPdfPasswordPlaceholder}
								type="password"
								value={password}
							/>
						</div>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button
						className="cursor-pointer"
						disabled={createImport.isPending}
						onClick={() => onOpenChange(false)}
						variant="outline"
					>
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={
							!provider ||
							!selectedCard ||
							!files.length ||
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
