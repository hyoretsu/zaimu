import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "./components";
export const Route = createFileRoute("/admin/")({ component: AdminPage });
