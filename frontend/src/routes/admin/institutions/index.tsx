import { createFileRoute } from "@tanstack/react-router";
import { InstitutionsPage } from "./components";
export const Route = createFileRoute("/admin/institutions/")({ component: InstitutionsPage });
