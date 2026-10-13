import { expect, test } from "bun:test";
import type { RecurrenceInput } from "./recurrence";
import { saveRecurrenceWithReplay } from "./recurrence-save";

test("replay retry uses the recurrence already created", async () => {
	const recovery = {
		addPast: true,
		completedWrite: false,
		debtEnabled: false,
		debtSplit: null,
		draft: {},
		input: { startDate: "2026-09-01" } as RecurrenceInput,
		savedId: undefined as string | undefined,
	};
	let creates = 0;
	let replays = 0;
	const service = {
		create: async () => {
			creates++;
			return { id: "created-once" };
		},
		replay: async (id: string) => {
			expect(id).toBe("created-once");
			replays++;
			if (replays === 1) throw new Error("Replay temporarily unavailable");
		},
		update: async () => {
			throw new Error("Unexpected update");
		},
	};
	await expect(saveRecurrenceWithReplay(recovery, undefined, service, "2026-10-13")).rejects.toThrow(
		"Replay temporarily unavailable",
	);
	expect(recovery.savedId).toBe("created-once");
	expect(recovery.completedWrite).toBeTrue();
	await saveRecurrenceWithReplay(recovery, undefined, service, "2026-10-13");
	expect(creates).toBe(1);
	expect(replays).toBe(2);
});
