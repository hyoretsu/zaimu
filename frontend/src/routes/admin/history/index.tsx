import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "./components";

export const Route = createFileRoute("/admin/history/")({ component: HistoryPage });
