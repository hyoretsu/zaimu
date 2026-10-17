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
	getTransactionImportProvider,
	supportsTransactionImport,
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
	const [file, setFile] = useState<File | null>(null);
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
		setFile(null);
		setFinancialAccountId(defaultFinancialAccountId ?? "");
		setInstitutionId("");
	}, [defaultFinancialAccountId, open]);
	useDialogCloseReset(open, () => {
		setFile(null);
		setInstitutionId("");
	});
	useEffect(() => {
		if (!open || !financialAccountId || !accounts.data) return;
		const account = accounts.data.find(account => account.id === financialAccountId);
		if (account && supportsTransactionImport(account)) {
			setInstitutionId(account.institution!.id);
		} else {
			setFinancialAccountId("");
		}
	}, [accounts.data, financialAccountId, open]);
	const selectedInstitution = institutions.data?.find(institution => institution.id === institutionId);
	const provider = getTransactionImportProvider(selectedInstitution) ?? "";
	const handleOpenChange = onOpenChange;
	const createImport = useMutation({
		meta: { cacheOperations: ["transaction"] },
		mutationFn: ({
			file,
			financialAccountId,
			provider,
		}: {
			file: File;
			financialAccountId: string;
			provider: TransactionImportProvider | "";
		}) => {
			if (!financialAccountId) throw new Error("Selecione a conta que receberá as transações.");
			if (!provider) throw new Error("Selecione a instituição do extrato.");
			const account = accounts.data?.find(account => account.id === financialAccountId);
			if (!account || !supportsTransactionImport(account) || account.institution?.id !== institutionId) {
				throw new Error("Selecione uma conta da instituição do extrato.");
			}
			return dataService.transactionImports.create({ file, financialAccountId, provider });
		},
		onError: error => {
			showToast(error.message, "negative");
		},
		onSuccess: async result => {
			handleOpenChange(false);
			if (!result.transactionImport) {
				showToast("Nenhuma transação nova encontrada no extrato.", "info");
				return;
			}
			await queryClient.invalidateQueries({
				queryKey: queryKeys.transactionImports.pending(identity!),
				refetchType: "active",
			});
			onImported(result.transactionImport.id);
			showToast(
				result.ignoredCount
					? `${result.ignoredCount} ${result.ignoredCount === 1 ? "transação já importada foi ignorada" : "transações já importadas foram ignoradas"}.`
					: "Extrato importado para revisão.",
				"positive",
			);
		},
	});
	const selectableAccounts =
		accounts.data
			?.filter(
				account =>
					supportsTransactionImport(account) && (!institutionId || account.institution?.id === institutionId),
			)
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Importar extrato</DialogTitle>
					<DialogDescription>Selecione a conta ou a instituição do extrato.</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 gap-5"
					onSubmit={event => {
						event.preventDefault();
						if (!file) return;
						createImport.mutate({ file, financialAccountId, provider });
					}}
				>
					<DialogBody>
						<CustomSelect
							label="Instituição"
							onValueChange={value => {
								setInstitutionId(value);
								if (
									accounts.data?.find(account => account.id === financialAccountId)?.institution?.id !== value
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
						<StatementFilePicker file={file} onFileChange={setFile} />
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
								!file ||
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
