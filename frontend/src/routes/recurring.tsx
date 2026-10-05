import { createFileRoute } from "@tanstack/react-router";
import { RecurringPage } from "@/routes/recurring/components/RecurringPage";

export const Route = createFileRoute("/recurring")({ component: RecurringPage });
