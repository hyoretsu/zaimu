import { createFileRoute } from "@tanstack/react-router";
import { AjustesPage } from "@/routes/settings/components/AjustesPage";

export const Route = createFileRoute("/settings/")({
	component: AjustesPage,
});
