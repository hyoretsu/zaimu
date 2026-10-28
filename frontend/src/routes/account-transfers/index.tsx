import { createFileRoute } from "@tanstack/react-router";
import { AccountTransfersPage } from "./components";

export const Route = createFileRoute("/account-transfers/")({
	component: AccountTransfersPage,
	validateSearch: (search: Record<string, unknown>): { transfer?: string } => ({
		transfer: typeof search.transfer === "string" ? search.transfer : undefined,
	}),
});
