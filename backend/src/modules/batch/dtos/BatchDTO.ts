import { t } from "elysia";
import { BATCH_MAX_ACTIONS } from "../../../../../shared/batch-policy";

export const BatchActionDTO = t.Object(
	{
		body: t.Optional(t.Unknown()),
		id: t.String({ maxLength: 100, minLength: 1 }),
		method: t.Union([t.Literal("POST"), t.Literal("PATCH"), t.Literal("PUT"), t.Literal("DELETE")]),
		path: t.String({ maxLength: 1024, minLength: 1 }),
	},
	{ additionalProperties: false },
);
export type BatchActionDTO = typeof BatchActionDTO.static;

export const BatchBody = t.Object(
	{
		operations: t.Array(BatchActionDTO, { maxItems: BATCH_MAX_ACTIONS, minItems: 1 }),
	},
	{ additionalProperties: false },
);
export type BatchBody = typeof BatchBody.static;

export const BatchResult = t.Object({
	results: t.Array(
		t.Object({
			data: t.Unknown(),
			id: t.String(),
			status: t.Integer(),
		}),
	),
});
export type BatchResult = typeof BatchResult.static;

export const BatchErrorReturn = t.Object({ error: t.String() });
