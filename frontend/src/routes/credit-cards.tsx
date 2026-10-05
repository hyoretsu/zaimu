import { createFileRoute } from "@tanstack/react-router";
import { CreditCardsPage } from "@/routes/credit-cards/components/CreditCardsPage";

export const Route = createFileRoute("/credit-cards")({ component: CreditCardsPage });
