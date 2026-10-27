import { describe, expect, test } from "bun:test";
import { createMemoryHistory } from "@tanstack/react-router";
import { createDialogHistory } from "./dialog-history";

describe("dialog history", () => {
	test("Back unwinds nested dialogs before subpages", () => {
		const history = createMemoryHistory({
			initialEntries: ["/more", "/settings", "/settings/open-finance"],
		});
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

test("replacing view parameters keeps nested dialogs open and adds no history steps", async () => {
	const history = createMemoryHistory({ initialEntries: ["/more", "/credit-cards"] });
	const dialogs = createDialogHistory(history);
	const closed: string[] = [];
	dialogs.retain("parent", () => closed.push("parent"));
	dialogs.retain("child", () => closed.push("child"));
	const length = history.length;
	history.replace("/credit-cards?statement=next", { ...history.location.state });
	history.replace("/credit-cards?statement=last", { ...history.location.state });
	expect(history.length).toBe(length);
	expect(closed).toEqual([]);
	expect(dialogs.isTopmost("child")).toBe(true);
	dialogs.release("child");
	await Promise.resolve();
	expect(dialogs.isTopmost("parent")).toBe(true);
	expect(history.location.href).toBe("/credit-cards");
	history.back();
	expect(closed).toEqual(["parent"]);
	history.back();
	expect(history.location.href).toBe("/more");
});

test("direct statement link restores a clean background and URL-backed modal", async () => {
	const original = "/credit-cards?next=96&previous=24&statement=invoice-1&existing=keep#list";
	const history = createMemoryHistory({ initialEntries: [original] });
	const dialogs = createDialogHistory(history);
	dialogs.retain("url:card", () => {}, {
		clear: ["statement", "next", "previous", "radius"],
		parameter: "card",
		value: "card-1",
	});
	expect(history.location.href).toBe(original.replace("#list", "&card=card-1#list"));
	expect(history.length).toBe(2);
	history.replace(history.location.href.replace("next=96", "next=108"), { ...history.location.state });
	dialogs.release("url:card");
	await Promise.resolve();
	expect(history.location.href).toBe("/credit-cards?existing=keep#list");
});

test("restored modal adopts its history entry after reload without pushing", async () => {
	const history = createMemoryHistory({
		initialEntries: ["/credit-cards", "/credit-cards?card=card-1&statement=invoice-1"],
	});
	history.replace(history.location.href, { zaimuDialogStack: ["url:card"] });
	const dialogs = createDialogHistory(history);
	dialogs.retain("url:card", () => {}, { clear: ["statement"], parameter: "card", value: "card-1" });
	expect(history.length).toBe(2);
	expect(history.location.state.__TSR_index).toBe(1);
	dialogs.release("url:card");
	await Promise.resolve();
	expect(history.location.href).toBe("/credit-cards");
});

test("Forward restores a URL-backed modal instead of skipping it as a stale entry", () => {
	const history = createMemoryHistory({ initialEntries: ["/loans"] });
	const dialogs = createDialogHistory(history);
	dialogs.retain("url:loan", () => {}, { parameter: "loan", value: "loan-1" });
	history.back();
	expect(history.location.href).toBe("/loans");
	history.forward();
	expect(history.location.href).toBe("/loans?loan=loan-1");
	dialogs.retain("url:loan", () => {}, { parameter: "loan", value: "loan-1" });
	expect(history.length).toBe(2);
	expect(dialogs.isTopmost("url:loan")).toBe(true);
});

test("nested URL-backed modals restore and unwind independently", async () => {
	const history = createMemoryHistory({
		initialEntries: ["/accounts?statementAccountId=account-1&details=record-1"],
	});
	const dialogs = createDialogHistory(history);
	dialogs.retain("url:statementAccountId", () => {}, {
		clear: ["details"],
		parameter: "statementAccountId",
		value: "account-1",
	});
	dialogs.retain("url:details", () => {}, { parameter: "details", value: "record-1" });
	expect(history.length).toBe(3);
	dialogs.release("url:details");
	await Promise.resolve();
	expect(history.location.href).toBe("/accounts?statementAccountId=account-1");
	expect(dialogs.isTopmost("url:statementAccountId")).toBe(true);
	dialogs.release("url:statementAccountId");
	await Promise.resolve();
	expect(history.location.href).toBe("/accounts");
});

test("URL restoration captures background scroll before rebuilding modal history", () => {
	const history = createMemoryHistory({ initialEntries: ["/credit-cards?statement=invoice"] });
	const captured: string[] = [];
	const dialogs = createDialogHistory(history, () => captured.push(history.location.href));
	dialogs.retain("url:card", () => {}, { clear: ["statement"], parameter: "card", value: "card" });
	expect(captured).toEqual(["/credit-cards?statement=invoice"]);
});

test("browser-style queued history flushes the clean background before pushing modal", () => {
	const history = createMemoryHistory({ initialEntries: ["/accounts?statementAccountId=account"] });
	const replace = history.replace.bind(history);
	const push = history.push.bind(history);
	let pending: (() => void) | undefined;
	history.replace = (...args) => {
		pending = () => replace(...args);
	};
	history.push = (...args) => {
		pending = () => push(...args);
	};
	history.flush = () => {
		const action = pending;
		pending = undefined;
		action?.();
	};
	const dialogs = createDialogHistory(history);
	dialogs.retain("url:statementAccountId", () => {}, { parameter: "statementAccountId", value: "account" });
	expect(history.location.href).toBe("/accounts?statementAccountId=account");
	history.back();
	expect(history.location.href).toBe("/accounts");
});
