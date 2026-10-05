import { createFileRoute } from "@tanstack/react-router";
import { DebtsPage } from "@/routes/debts/components/DebtsPage";

export const Route = createFileRoute("/debts")({ component: DebtsPage });
