import { createFileRoute } from "@tanstack/react-router";
import { UsersPage } from "./components";

export const Route = createFileRoute("/admin/users/")({ component: UsersPage });
