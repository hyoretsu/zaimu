import { describe, expect, test } from "bun:test";
import { createMemoryHistory } from "@tanstack/history";
import { createDialogHistory } from "./dialog-history";

describe("dialog history", () => {
	test("Back unwinds nested dialogs before subpages", () => {
		const history = createMemoryHistory({ initialEntries: ["/more", "/settings", "/settings/open-finance"] });
		const dialogs = createDialogHistory(history);
		const closed: string[] = [];
		dialogs.retain("parent", () => closed.push("parent"));
		dialogs.retain("child", () => closed.push("child"));
		history.back();
		expect(closed).toEqual(["child"]);
		expect(history.location.pathname).toBe("/settings/open-finance");
		history.back();
		expect(closed).toEqual(["child", "parent"]);
		history.back();
		expect(history.location.pathname).toBe("/settings");
		history.back();
		expect(history.location.pathname).toBe("/more");
	});

	test("explicit close consumes its entry and preserves router state", async () => {
		const history = createMemoryHistory({ initialEntries: ["/more", "/settings"] });
		history.replace("/settings", { custom: "preserved" });
		const dialogs = createDialogHistory(history);
		dialogs.retain("modal", () => {});
		expect(history.location.state).toMatchObject({ custom: "preserved" });
		dialogs.release("modal");
		await Promise.resolve();
		expect(history.location.state.__TSR_index).toBe(1);
		history.back();
		expect(history.location.pathname).toBe("/more");
	});

	test("effect replay and callback changes do not duplicate history entries", async () => {
		const history = createMemoryHistory({ initialEntries: ["/settings"] });
		const dialogs = createDialogHistory(history);
		const closed: string[] = [];
		dialogs.retain("modal", () => closed.push("old"));
		dialogs.release("modal");
		dialogs.retain("modal", () => closed.push("new"));
		await Promise.resolve();
		expect(history.length).toBe(2);
		history.back();
		expect(closed).toEqual(["new"]);
	});

	test("navigation dismisses dialogs and Back skips their stale entries", async () => {
		const history = createMemoryHistory({ initialEntries: ["/more", "/settings"] });
		const dialogs = createDialogHistory(history);
		let closed = false;
		dialogs.retain("modal", () => {
			closed = true;
		});
		history.push("/accounts");
		expect(closed).toBe(true);
		dialogs.release("modal");
		await Promise.resolve();
		expect(history.location.pathname).toBe("/accounts");
		history.back();
		expect(history.location.pathname).toBe("/settings");
		expect(history.location.state.__TSR_index).toBe(1);
	});
});

test("explicit topmost dismissal respects history order even when portal order differs", async () => {
	const history = createMemoryHistory({ initialEntries: ["/accounts"] });
	const dialogs = createDialogHistory(history);
	const closed: string[] = [];
	dialogs.retain("parent", () => closed.push("parent"));
	dialogs.retain("child", () => closed.push("child"));
	expect(dialogs.depth("parent")).toBe(1);
	expect(dialogs.depth("child")).toBe(2);
	expect(dialogs.dismissTopmost()).toBeTrue();
	expect(closed).toEqual(["child"]);
	dialogs.release("child");
	await Promise.resolve();
	expect(dialogs.isTopmost("parent")).toBeTrue();
	expect(dialogs.dismissTopmost()).toBeTrue();
	expect(closed).toEqual(["child", "parent"]);
});
