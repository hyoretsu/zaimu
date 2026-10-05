import { createFileRoute } from "@tanstack/react-router";
import { EmpréstimosPage } from "@/routes/loans/components/EmpréstimosPage";

export const Route = createFileRoute("/loans")({ component: EmpréstimosPage });
