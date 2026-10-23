import { t } from "elysia";

export const CardCalendarPeriodDTO = t.Object({
	dueDay: t.Integer({ maximum: 31, minimum: 1 }),
	effectiveDate: t.String({ format: "date" }),
	firstDueDate: t.String({ format: "date" }),
	firstStatementDate: t.String({ format: "date" }),
	installmentMode: t.Union([t.Literal("PER_CYCLE"), t.Literal("PER_MONTH")]),
	statementDay: t.Integer({ maximum: 31, minimum: 1 }),
	transitionMode: t.Union([t.Literal("EXTRA_CYCLE"), t.Literal("NEXT_CYCLE")]),
	workingDueDate: t.Boolean(),
});
export type CardCalendarPeriodDTO = typeof CardCalendarPeriodDTO.static;
