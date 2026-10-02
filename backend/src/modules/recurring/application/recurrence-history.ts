import {
	decodePaginationCursor,
	encodePaginationCursor,
	paginationFilterHash,
} from "~/shared/application/pagination-cursor";
import { distributedCache } from "~/shared/infra/cache";
import { queryRaw } from "~/shared/infra/sql";
import { getStoredRecurrence } from "./recurrences";

export async function getCachedRecurrenceHistory(
	userId: string,
	id: string,
	options: { cursor?: string; limit?: number },
	source?: string,
	resolveId?: () => Promise<string>,
) {
	const limit = options.limit ?? 50;
	const filterHash = paginationFilterHash(userId, { domain: "recurrence-history", id, source });
	const cursor = decodePaginationCursor(
		options.cursor,
		filterHash,
		(value): value is { changedAt: string; id: string } => {
			if (!value || typeof value !== "object") return false;
			const item = value as Record<string, unknown>;
			return (
				typeof item.id === "string" &&
				item.id.length > 0 &&
				typeof item.changedAt === "string" &&
				Number.isFinite(Date.parse(item.changedAt))
			);
		},
	);
	return distributedCache.remember(
		userId,
		"schedules:history",
		{ cursor: options.cursor, id, limit, source },
		async () => {
			const recurrenceId = resolveId ? await resolveId() : id;
			await getStoredRecurrence(userId, recurrenceId);
			const rows = await queryRaw<{
				id: string;
				recurrenceId: string;
				field: string;
				oldValue: string | null;
				newValue: string | null;
				changedAt: Date;
			}>(
				`SELECT "id", "recurrenceId", "field", "oldValue", "newValue", "changedAt" FROM "RecurrenceHistory"
 WHERE "recurrenceId"=$1 AND ($2::timestamp IS NULL OR ("changedAt", "id") < ($2::timestamp, $3::text))
 ORDER BY "changedAt" DESC,"id" DESC LIMIT $4`,
				[recurrenceId, cursor?.changedAt ?? null, cursor?.id ?? null, limit + 1],
			);
			const hasMore = rows.length > limit,
				items = rows.slice(0, limit).map(row => ({ ...row, changedAt: row.changedAt.toISOString() })),
				last = items.at(-1);
			return {
				hasMore,
				items,
				nextCursor:
					hasMore && last
						? encodePaginationCursor({ filterHash, value: { changedAt: last.changedAt, id: last.id } })
						: null,
			};
		},
	);
}
