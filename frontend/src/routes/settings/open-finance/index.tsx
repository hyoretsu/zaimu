import { createFileRoute } from "@tanstack/react-router";
import { OpenFinancePage } from "@/routes/settings/open-finance/components/OpenFinancePage";

export const Route = createFileRoute("/settings/open-finance/")({ component: OpenFinancePage });
