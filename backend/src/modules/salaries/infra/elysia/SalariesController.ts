import { legacyRecurrenceController } from "~/modules/recurring/infra/elysia/legacy-controller";
export const SalariesController = legacyRecurrenceController("/salaries", "salary");
