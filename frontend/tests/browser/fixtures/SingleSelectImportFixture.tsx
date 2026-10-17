import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ImportTransactionsDialog } from "@/components/transaction-imports/ImportTransactionsDialog";
import { dataService } from "@/lib/dataService";
import { useAuthStore } from "@/stores/auth";

const institutions = [
	{ id: "inter", name: "Inter" },
	{ id: "nubank", name: "Nubank" },
];
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
useAuthStore.setState({ guestId: "single-select", isGuestMode: true });
dataService.financialInstitutions.getAll = async () =>
	institutions as Awaited<ReturnType<typeof dataService.financialInstitutions.getAll>>;
dataService.accounts.getAll = async () =>
	institutions.map(institution => ({
		id: `account-${institution.id}`,
		institution,
		name: institution.name,
		type: "CHECKING",
	})) as Awaited<ReturnType<typeof dataService.accounts.getAll>>;
dataService.transactionImports.create = async payload => {
	Object.assign(window, {
		submittedImport: { financialAccountId: payload.financialAccountId, provider: payload.provider },
	});
	throw new Error("Submission captured locally");
};

export function SingleSelectImportFixture() {
	const [open, setOpen] = useState(true);
	return (
		<QueryClientProvider client={client}>
			<ImportTransactionsDialog onImported={() => undefined} onOpenChange={setOpen} open={open} />
		</QueryClientProvider>
	);
}
