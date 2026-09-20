import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuFileUp } from "react-icons/lu";
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
import { dataService } from "@/lib/dataService";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
} from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { StatementFilePicker } from "./StatementFilePicker";

const providerOptions = [
	{ label: "Banco do Brasil", value: "BANCO_DO_BRASIL" },
	{ label: "Banco Inter", value: "INTER" },
	{ label: "Mercado Pago", value: "MERCADO_PAGO" },
	{ label: "Nubank", value: "NUBANK" },
	{ label: "PicPay", value: "PICPAY" },
] as const;
type TransactionImportProvider = (typeof providerOptions)[number]["value"];

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
	const [provider, setProvider] = useState<TransactionImportProvider | "">("");
	const accounts = useQuery({
		enabled: identity !== null && open,
		queryFn: dataService.accounts.getAll,
		queryKey: queryKeys.accounts.list(identity!),
	});
	useEffect(() => {
		if (!open) return;
		setFile(null);
		setFinancialAccountId(defaultFinancialAccountId ?? "");
		setProvider("");
	}, [defaultFinancialAccountId, open]);
	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setFile(null);
			setProvider("");
		}
		onOpenChange(nextOpen);
	};
	const createImport = useMutation({
		mutationFn: () => {
			if (!file) throw new Error("Selecione um PDF de extrato.");
			if (!financialAccountId) throw new Error("Selecione a conta que receberá as transações.");
			if (!provider) throw new Error("Selecione a instituição do extrato.");
			return dataService.transactionImports.create({ file, financialAccountId, provider });
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			setFile(null);
			setProvider("");
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
			?.filter(account => account.type !== "CREDIT_CARD" && account.type !== "REWARDS")
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Importar extrato</DialogTitle>
					<DialogDescription>Selecione manualmente a conta e a instituição do extrato.</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-4"
					onSubmit={event => {
						event.preventDefault();
						createImport.mutate();
					}}
				>
					<CustomSelect
						label="Instituição"
						onValueChange={value => setProvider(value as TransactionImportProvider)}
						options={providerOptions.map(option => ({ ...option }))}
						placeholder="Selecione a instituição"
						required
						sortOptions={false}
						value={provider}
					/>
					<CustomSelect
						label="Conta que receberá as transações"
						onValueChange={setFinancialAccountId}
						options={selectableAccounts.map(account => ({
							label: getFinancialAccountOptionLabel(account),
							value: account.id,
						}))}
						placeholder="Selecione manualmente a conta"
						required
						searchable
						value={financialAccountId}
					/>
					<StatementFilePicker file={file} onFileChange={setFile} />
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
							disabled={!file || !financialAccountId || !provider || createImport.isPending}
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
