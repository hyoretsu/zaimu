import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "pg";
import { closeDatabase, queryRaw, withRawTransaction } from "sql";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import {
	deleteMonthlyBudget,
	listMonthlyBudgets,
	saveMonthlyBudget,
	syncMonthlyBudget,
} from "../application/monthly-budgets";
import type { MonthlyBudgetBody } from "../infra/MonthlyBudgetsDTO";

const url = requireFixtureUrl("DATABASE_TEST_URL");
beforeAll(async () => {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		await installContractFixture(client, contract);
	} finally {
		await client.end();
	}
	await queryRaw(
		`INSERT INTO "user" (id,email,name) VALUES ('mb-owner','mb-owner@test.invalid','Owner'),('mb-other','mb-other@test.invalid','Other'),('mb-owner-2','mb-owner-2@test.invalid','Owner 2')`,
	);
	await queryRaw(
		`INSERT INTO "Category" (id,"userId",name) VALUES ('mb-cat-a','mb-owner','A'),('mb-cat-b','mb-owner','B'),('mb-cat-foreign','mb-other','F'),('mb-cat-2','mb-owner-2','C')`,
	);
});
afterAll(() => closeDatabase());

const body = (over: Partial<MonthlyBudgetBody>): MonthlyBudgetBody => ({
	amount: 10,
	categoryId: null,
	currency: "BRL",
	endMonth: null,
	name: "Plan",
	parentBudgetId: null,
	source: "STATEMENTS",
	startMonth: "2026-01",
	...over,
});
const statusOf = async (promise: Promise<unknown>) => {
	const error = await promise.then(
		() => undefined,
		(caught: unknown) => caught as { statusCode?: number },
	);
	return error?.statusCode;
};

test("overlap honours source, currency, category nulls, month ranges and single-month separation", async () => {
	const owner = "mb-owner";
	await saveMonthlyBudget(
		owner,
		body({ endMonth: "2026-06", source: "STATEMENTS", startMonth: "2026-03" }),
	);
	expect(
		await statusOf(
			saveMonthlyBudget(owner, body({ endMonth: "2026-04", name: "x", startMonth: "2026-01" })),
		),
	).toBe(409);
	expect(await statusOf(saveMonthlyBudget(owner, body({ startMonth: "2026-06" })))).toBe(409);
	expect(await statusOf(saveMonthlyBudget(owner, body({ startMonth: "2026-01" })))).toBe(409);
	await saveMonthlyBudget(owner, body({ endMonth: "2026-02", startMonth: "2026-01" }));
	await saveMonthlyBudget(owner, body({ startMonth: "2026-07" }));
	// other currency never collides; single-month adjustment inside a range is a different kind
	await saveMonthlyBudget(owner, body({ currency: "USD", startMonth: "2026-03" }));
	await saveMonthlyBudget(owner, body({ endMonth: "2026-04", startMonth: "2026-04" }));
	expect(
		await statusOf(saveMonthlyBudget(owner, body({ endMonth: "2026-04", startMonth: "2026-04" }))),
	).toBe(409);
	// categories: null and distinct categories are independent
	await saveMonthlyBudget(
		owner,
		body({ categoryId: "mb-cat-a", name: "t", source: "TAG", startMonth: "2026-03" }),
	);
	await saveMonthlyBudget(
		owner,
		body({ categoryId: "mb-cat-b", name: "t", source: "TAG", startMonth: "2026-03" }),
	);
	expect(
		await statusOf(
			saveMonthlyBudget(
				owner,
				body({ categoryId: "mb-cat-a", name: "u", source: "TAG", startMonth: "2026-05" }),
			),
		),
	).toBe(409);
	expect(
		await statusOf(
			saveMonthlyBudget(
				owner,
				body({ categoryId: "mb-cat-foreign", name: "u", source: "TAG", startMonth: "2027-01" }),
			),
		),
	).toBe(404);
	// another user's identical budget does not collide
	await saveMonthlyBudget("mb-other", body({ endMonth: "2026-06", startMonth: "2026-03" }));
});

test("RESERVE and UNCATEGORIZED collide only on same name; TAG and STATEMENTS ignore it", async () => {
	// Own user: the first test leaves open-ended STATEMENTS/TAG budgets that would overlap these.
	const owner = "mb-owner-2";
	await saveMonthlyBudget(owner, body({ name: "Res A", source: "RESERVE", startMonth: "2030-01" }));
	await saveMonthlyBudget(owner, body({ name: "Res B", source: "RESERVE", startMonth: "2030-01" }));
	expect(
		await statusOf(
			saveMonthlyBudget(owner, body({ name: "Res A", source: "RESERVE", startMonth: "2030-01" })),
		),
	).toBe(409);
	await saveMonthlyBudget(
		owner,
		body({ amount: null, name: "Un A", source: "UNCATEGORIZED", startMonth: "2030-01" }),
	);
	await saveMonthlyBudget(
		owner,
		body({ amount: null, name: "Un B", source: "UNCATEGORIZED", startMonth: "2030-01" }),
	);
	expect(
		await statusOf(
			saveMonthlyBudget(
				owner,
				body({ amount: null, name: "Un A", source: "UNCATEGORIZED", startMonth: "2030-01" }),
			),
		),
	).toBe(409);
	await saveMonthlyBudget(owner, body({ name: "Stm 1", startMonth: "2031-01" }));
	expect(await statusOf(saveMonthlyBudget(owner, body({ name: "Stm 2", startMonth: "2031-01" })))).toBe(
		409,
	);
	await saveMonthlyBudget(
		owner,
		body({ categoryId: "mb-cat-2", name: "Tag 1", source: "TAG", startMonth: "2031-01" }),
	);
	expect(
		await statusOf(
			saveMonthlyBudget(
				owner,
				body({ categoryId: "mb-cat-2", name: "Tag 2", source: "TAG", startMonth: "2031-01" }),
			),
		),
	).toBe(409);
});

test("update restamps updatedAt with the statement clock and keeps values exact; delete cascades through deleted nodes", async () => {
	const owner = "mb-owner";
	const root = await saveMonthlyBudget(
		owner,
		body({ amount: 100.123456, name: "root", source: "CUSTOM", startMonth: "2040-01" }),
	);
	const child = await saveMonthlyBudget(
		owner,
		body({ name: "child", parentBudgetId: root.id, source: "CUSTOM", startMonth: "2040-01" }),
	);
	const grand = await saveMonthlyBudget(
		owner,
		body({ name: "grand", parentBudgetId: child.id, source: "CUSTOM", startMonth: "2040-01" }),
	);
	const before = Date.now();
	const updated = await saveMonthlyBudget(
		owner,
		body({ amount: 7.5, name: "root2", source: "CUSTOM", startMonth: "2040-01" }),
		root.id,
	);
	expect(updated.amount).toBe(7.5);
	expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(root.updatedAt));
	expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(before - 5);
	expect(updated.createdAt).toBe(root.createdAt);
	expect(await statusOf(saveMonthlyBudget("mb-other", body({ source: "CUSTOM" }), root.id))).toBe(404);
	// delete the middle node first, then the root: the grandchild must be reached through the deleted child
	await deleteMonthlyBudget(owner, grand.id);
	await queryRaw(`UPDATE "MonthlyBudget" SET "deletedAt"=now() WHERE id=$1`, [child.id]);
	await queryRaw(`UPDATE "MonthlyBudget" SET "deletedAt"=NULL WHERE id=$1`, [grand.id]);
	expect(await statusOf(deleteMonthlyBudget("mb-other", root.id))).toBe(404);
	await deleteMonthlyBudget(owner, root.id);
	const rows = await queryRaw<{ id: string; deletedAt: Date | null; updatedAt: Date }>(
		`SELECT id,"deletedAt","updatedAt" FROM "MonthlyBudget" WHERE id=ANY($1)`,
		[[root.id, child.id, grand.id]],
	);
	const byId = Object.fromEntries(rows.map(row => [row.id, row]));
	expect(byId[root.id]?.deletedAt).not.toBeNull();
	expect(byId[grand.id]?.deletedAt).not.toBeNull();
	expect(byId[root.id]?.deletedAt?.getTime()).toBe(byId[root.id]?.updatedAt.getTime());
	expect(await statusOf(deleteMonthlyBudget(owner, root.id))).toBe(404);
	expect((await listMonthlyBudgets(owner)).some(row => row.id === root.id)).toBe(false);
	expect((await listMonthlyBudgets(owner, true)).some(row => row.id === root.id)).toBe(true);
});

test("sync enforces ownership, version conflicts, tombstones and idempotent creation", async () => {
	const owner = "mb-owner";
	type Entity = Parameters<typeof syncMonthlyBudget>[1];
	const entity = {
		...body({ name: "Synced", source: "CUSTOM", startMonth: "2050-01" }),
		amount: 5,
		categoryId: null,
		createdAt: new Date().toISOString(),
		deletedAt: null,
		endMonth: null,
		id: "mb-sync-1",
		updatedAt: new Date().toISOString(),
		userId: owner,
	} as unknown as Entity;
	const sync = (userId: string, value: Entity) =>
		withRawTransaction(() => syncMonthlyBudget(userId, value));
	await sync(owner, entity);
	expect(await statusOf(sync(owner, entity))).toBe(409); // existing rows require a matching baseUpdatedAt
	const [created] = await queryRaw<{ updatedAt: Date }>(
		`SELECT "updatedAt" FROM "MonthlyBudget" WHERE id='mb-sync-1'`,
	);
	expect(await statusOf(sync("mb-other", entity))).toBe(403);
	expect(await statusOf(sync(owner, { ...entity, name: "stale" }))).toBe(409);
	expect(
		await statusOf(sync(owner, { ...entity, baseUpdatedAt: "2000-01-01T00:00:00.000Z", name: "stale" })),
	).toBe(409);
	await sync(owner, { ...entity, baseUpdatedAt: created?.updatedAt.toISOString(), name: "Renamed" });
	const [renamed] = await queryRaw<{ name: string }>(
		`SELECT name FROM "MonthlyBudget" WHERE id='mb-sync-1'`,
	);
	expect(renamed?.name).toBe("Renamed");
	// tombstone for an unknown entity inserts an already-deleted row with a DB-clock deletedAt
	const before = Date.now();
	await sync(owner, { ...entity, deletedAt: new Date().toISOString(), id: "mb-sync-2", source: "TAG" });
	const [tomb] = await queryRaw<{ deletedAt: Date; source: string }>(
		`SELECT "deletedAt",source FROM "MonthlyBudget" WHERE id='mb-sync-2'`,
	);
	expect(tomb?.source).toBe("CUSTOM");
	expect(tomb?.deletedAt.getTime()).toBeGreaterThanOrEqual(before - 5);
	// deleted rows are final: later syncs are ignored
	await sync(owner, { ...entity, id: "mb-sync-2", name: "ignored" });
	// tombstone for an existing entity soft-deletes it
	const [current] = await queryRaw<{ updatedAt: Date }>(
		`SELECT "updatedAt" FROM "MonthlyBudget" WHERE id='mb-sync-1'`,
	);
	await sync(owner, {
		...entity,
		baseUpdatedAt: current?.updatedAt.toISOString(),
		deletedAt: new Date().toISOString(),
	});
	const [gone] = await queryRaw<{ deletedAt: Date | null }>(
		`SELECT "deletedAt" FROM "MonthlyBudget" WHERE id='mb-sync-1'`,
	);
	expect(gone?.deletedAt).not.toBeNull();
});
