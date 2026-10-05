import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/routes/components/DashboardPage";

export const Route = createFileRoute("/")({ component: DashboardPage });
