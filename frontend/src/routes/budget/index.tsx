import { createFileRoute } from "@tanstack/react-router";
import { BudgetPage } from "./components";

export const Route = createFileRoute("/budget/")({ component: BudgetPage });
