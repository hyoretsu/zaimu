import { createFileRoute } from "@tanstack/react-router";
import { TransactionsPage } from "@/routes/transactions/components/TransactionsPage";

export const Route = createFileRoute("/transactions")({ component: TransactionsPage });
