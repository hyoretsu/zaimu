import { t } from "elysia";

export const CategorySummaryReturn = t.Object({
	color: t.Union([t.String(), t.Null()]),
	icon: t.Union([t.String(), t.Null()]),
	id: t.String(),
	name: t.String(),
	parentId: t.Union([t.String(), t.Null()]),
	userId: t.String(),
});
export const CategoryPageReturn = t.Object({
	hasMore: t.Boolean(),
	items: t.Array(CategorySummaryReturn),
	nextCursor: t.Union([t.String(), t.Null()]),
});
