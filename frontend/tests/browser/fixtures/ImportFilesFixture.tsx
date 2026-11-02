import { TooltipProvider } from "@/components/ui/Tooltip";
import "@/index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ImportTransactionsDialog } from "@/components/transaction-imports/ImportTransactionsDialog";
import { StatementFilePicker } from "@/components/transaction-imports/StatementFilePicker";
import type { FinancialAccount, FinancialInstitution } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { useAuthStore } from "@/stores/auth";
const institution = { id: "bank", name: "Nubank" } as FinancialInstitution;
const account = { id: "account", institution, name: "Conta teste", type: "CHECKING" } as FinancialAccount;
dataService.financialInstitutions.getAll = async () => [institution];
dataService.accounts.getAll = async () => [account];
function ImportFilesFixture() {
	const [files, setFiles] = useState<File[]>([]);
	return (
		<main className="mx-auto max-w-lg p-4">
			<h1>Importar extratos</h1>
			<StatementFilePicker files={files} onFilesChange={setFiles} />
		</main>
	);
}
useAuthStore.setState({ isAuthenticated: true, isGuestMode: false, user: { id: "browser-user" } as never });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
	<QueryClientProvider client={client}>
		<TooltipProvider>
			{new URLSearchParams(location.search).has("dialog") ? (
				<ImportTransactionsDialog
					defaultFinancialAccountId="account"
					onImported={() => {}}
					onOpenChange={() => {}}
					open
				/>
			) : (
				<ImportFilesFixture />
			)}
		</TooltipProvider>
	</QueryClientProvider>,
);
