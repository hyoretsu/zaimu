import { createFileRoute } from "@tanstack/react-router";
import { AccountsPage } from "@/routes/accounts/components/AccountsPage";

export const Route = createFileRoute("/accounts")({
	component: AccountsPage,
	validateSearch: (search: Record<string, unknown>): { statementAccountId?: string } => ({
		statementAccountId: typeof search.statementAccountId === "string" ? search.statementAccountId : undefined,
	}),
});
