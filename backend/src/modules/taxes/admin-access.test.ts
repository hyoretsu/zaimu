import { expect, test } from "bun:test";
import { assertAdminRole } from "./admin-access";

test("only exact ADMIN role authorizes administration", () => {
	expect(() => assertAdminRole("ADMIN")).not.toThrow();
	for (const role of [undefined, "USER", "admin", "SUPERADMIN", ""])
		expect(() => assertAdminRole(role)).toThrow();
});
