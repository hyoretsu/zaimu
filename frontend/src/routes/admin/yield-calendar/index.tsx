import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "./components";
export const Route = createFileRoute("/admin/yield-calendar/")({ component: CalendarPage });
