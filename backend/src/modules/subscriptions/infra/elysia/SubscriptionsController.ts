import { legacyRecurrenceController } from "~/modules/recurring/infra/elysia/legacy-controller";
export const SubscriptionsController = legacyRecurrenceController("/subscriptions", "subscription");
