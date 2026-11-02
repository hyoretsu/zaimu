import { t } from "elysia";
export const BatchUploadAccepted = t.Object({ batchId: t.String() });
export const BatchUploadReturn = t.Object({
	batchId: t.String(),
	results: t.Array(
		t.Object({
			error: t.Nullable(t.String()),
			fileName: t.String(),
			ignoredCount: t.Number(),
			importId: t.Nullable(t.String()),
			index: t.Number(),
			status: t.Union([
				t.Literal("QUEUED"),
				t.Literal("RUNNING"),
				t.Literal("SUCCEEDED"),
				t.Literal("FAILED"),
			]),
			success: t.Boolean(),
		}),
	),
	status: t.Union([t.Literal("QUEUED"), t.Literal("RUNNING"), t.Literal("COMPLETED")]),
});
export type BatchUploadReturn = typeof BatchUploadReturn.static;
