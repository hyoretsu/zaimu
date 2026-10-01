import { expect, test } from "bun:test";
import Elysia from "elysia";
import { CategoryPageReturn } from "./CategoriesDTO";

test("category pages validate nullable fields after cache serialization", async () => {
	const page = {
		hasMore: false,
		items: [{ color: null, icon: null, id: "tag", name: "Alimentação", parentId: null, userId: "owner" }],
		nextCursor: null,
	};
	const app = new Elysia().get("/", () => JSON.parse(JSON.stringify(page)), { response: CategoryPageReturn });
	const response = await app.handle(new Request("http://localhost/"));
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(page);
});
