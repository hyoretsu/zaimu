import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuFileUp } from "react-icons/lu";
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
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import { dataService } from "@/lib/dataService";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
} from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { StatementFilePicker } from "./StatementFilePicker";
import {
	getSelectableImportAccounts,
	getTransactionImportProvider,
	type TransactionImportProvider,
} from "./transaction-import-institutions";

export function ImportTransactionsDialog({
	defaultFinancialAccountId,
	onImported,
	onOpenChange,
	open,
}: {
	defaultFinancialAccountId?: string;
	onImported: (importId: string) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [files, setFiles] = useState<File[]>([]);
	const [fileErrors, setFileErrors] = useState<string[]>([]);
	const [progress, setProgress] = useState({ completed: 0, total: 0 });
	const [financialAccountId, setFinancialAccountId] = useState(defaultFinancialAccountId ?? "");
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
	useEffect(() => {
		if (!open) return;
		setFiles([]);
		setFileErrors([]);
		setFinancialAccountId(defaultFinancialAccountId ?? "");
		setInstitutionId("");
	}, [defaultFinancialAccountId, open]);
	useDialogCloseReset(open, () => {
		setFiles([]);
		setFileErrors([]);
		setFinancialAccountId("");
		setInstitutionId("");
	});
	useEffect(() => {
		if (!open || !financialAccountId || !accounts.data || !institutions.data) return;
		const account = accounts.data.find(account => account.id === financialAccountId);
		if (account && getSelectableImportAccounts([account], institutions.data, "").length) {
			setInstitutionId(account.institution!.id);
		} else {
			setFinancialAccountId("");
		}
	}, [accounts.data, financialAccountId, institutions.data, open]);
	const selectedInstitution = institutions.data?.find(institution => institution.id === institutionId);
	const provider = getTransactionImportProvider(selectedInstitution) ?? "";
	const handleOpenChange = (value: boolean) => {
		if (!createImport.isPending) onOpenChange(value);
	};
	const createImport = useMutation({
		meta: { cacheOperations: ["transaction"] },
		mutationFn: ({
			files,
			financialAccountId,
			provider,
		}: {
			files: File[];
			financialAccountId: string;
			provider: TransactionImportProvider | "";
		}) => {
			if (!financialAccountId) throw new Error("Selecione a conta que receberá as transações.");
			if (!provider) throw new Error("Selecione a instituição do extrato.");
			const account = accounts.data?.find(account => account.id === financialAccountId);
			if (
				!account ||
				!getSelectableImportAccounts([account], institutions.data ?? [], institutionId).length
			) {
				throw new Error("Selecione uma conta da instituição do extrato.");
			}
			return dataService.transactionImports.createBatch({
				files,
				financialAccountId,
				onProgress: setProgress,
				provider,
			});
		},
		onError: error => {
			showToast(error.message, "negative");
		},
		onSuccess: async (result, variables) => {
			const failures = result.results.filter(item => !item.success);
			setFileErrors(failures.map(item => `${item.index + 1}. ${item.fileName}: ${item.error}`));
			setFiles(
				variables.files.filter((file, index) =>
					failures.some(item => item.index === index && item.fileName === file.name),
				),
			);
			await queryClient.invalidateQueries({
				queryKey: queryKeys.transactionImports.pending(identity!),
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
	const selectableAccounts = getSelectableImportAccounts(
		accounts.data ?? [],
		institutions.data ?? [],
		institutionId,
	).toSorted(compareFinancialAccountsByOptionLabel);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Importar extrato</DialogTitle>
					<DialogDescription>Selecione a conta ou a instituição do extrato.</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
					onSubmit={event => {
						event.preventDefault();
						if (!files.length) return;
						createImport.mutate({ files, financialAccountId, provider });
					}}
				>
					<DialogBody>
						<CustomSelect
							disabled={createImport.isPending}
							isLoading={accounts.isPending || institutions.isPending}
							label="Instituição"
							onValueChange={value => {
								setInstitutionId(value);
								if (
									accounts.data?.find(account => account.id === financialAccountId)
										?.institution?.id !== value
								) {
									setFinancialAccountId("");
								}
							}}
							options={(institutions.data ?? [])
								.filter(institution => getTransactionImportProvider(institution))
								.map(institution => ({ label: institution.name, value: institution.id }))}
							placeholder="Selecione a instituição"
							required
							searchable
							value={institutionId}
						/>
						<CustomSelect
							disabled={createImport.isPending}
							isLoading={accounts.isPending || institutions.isPending}
							label="Conta que receberá as transações"
							onValueChange={value => {
								setFinancialAccountId(value);
								const account = accounts.data?.find(account => account.id === value);
								if (account?.institution) setInstitutionId(account.institution.id);
							}}
							options={selectableAccounts.map(account => ({
								label: getFinancialAccountOptionLabel(account),
								value: account.id,
							}))}
							placeholder="Selecione a conta"
							required
							searchable
							value={financialAccountId}
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
					</DialogBody>
					<DialogFooter>
						<Button
							className="cursor-pointer"
							onClick={() => handleOpenChange(false)}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={
								!files.length ||
								!financialAccountId ||
								!provider ||
								accounts.isPending ||
								institutions.isPending ||
								createImport.isPending
							}
							type="submit"
						>
							<LuFileUp /> {createImport.isPending ? "Importando extrato…" : "Importar extrato"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
