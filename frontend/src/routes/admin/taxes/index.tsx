import { createFileRoute } from "@tanstack/react-router";
import { TaxesPage } from "./components";

export const Route = createFileRoute("/admin/taxes/")({ component: TaxesPage });
