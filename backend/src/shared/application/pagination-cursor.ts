import { createHash } from "node:crypto";
import { HttpException } from "~/shared/errors";

export interface PaginationCursor<Value> {
	filterHash: string;
	value: Value;
}

const stableValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, stableValue(item)]),
		);
	return value;
};

export const paginationFilterHash = (userId: string, filters: unknown) =>
	createHash("sha256")
		.update(JSON.stringify(stableValue({ filters, userId })))
		.digest("hex");

export const encodePaginationCursor = <Value>(cursor: PaginationCursor<Value>) =>
	Buffer.from(JSON.stringify(cursor)).toString("base64url");

export const decodePaginationCursor = <Value>(
	cursor: string | undefined,
	expectedFilterHash: string,
	validate: (value: unknown) => value is Value,
): Value | null => {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as PaginationCursor<unknown>;
		if (parsed.filterHash !== expectedFilterHash || !validate(parsed.value))
			throw new Error("invalid cursor");
		return parsed.value;
	} catch {
		throw new HttpException("Cursor inválido para estes filtros", 400);
	}
};
