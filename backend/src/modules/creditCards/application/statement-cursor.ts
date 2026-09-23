import { HttpException } from "~/shared/errors";

export interface StatementCursor {
	filter: "all" | "paid" | "unpaid";
	id: string;
	statementDate: string;
}

export const statementFilterKey = (isPaid?: boolean): StatementCursor["filter"] =>
	isPaid === undefined ? "all" : isPaid ? "paid" : "unpaid";

export const encodeStatementCursor = (cursor: StatementCursor) =>
	Buffer.from(JSON.stringify(cursor)).toString("base64url");

export const decodeStatementCursor = (
	cursor: string | undefined,
	isPaid?: boolean,
): StatementCursor | null => {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as StatementCursor;
		if (
			!parsed.id ||
			Number.isNaN(Date.parse(parsed.statementDate)) ||
			parsed.filter !== statementFilterKey(isPaid)
		)
			throw new Error("invalid cursor");
		return parsed;
	} catch {
		throw new HttpException("Cursor inválido para este filtro", 400);
	}
};
