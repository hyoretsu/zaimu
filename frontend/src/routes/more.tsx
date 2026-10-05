import { createFileRoute } from "@tanstack/react-router";
import { MorePage } from "@/routes/more/components/MorePage";

export const Route = createFileRoute("/more")({
	component: MorePage,
});
