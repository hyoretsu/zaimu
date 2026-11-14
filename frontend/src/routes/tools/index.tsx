import { createFileRoute } from "@tanstack/react-router";
import { ToolsPage } from "./components";

export const Route = createFileRoute("/tools/")({ component: ToolsPage });
