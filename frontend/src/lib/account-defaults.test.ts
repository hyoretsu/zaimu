import { expect, test } from "bun:test";
import { saveAccountDefaults } from "./account-defaults";

test("retry after a partial account defaults save applies only the missing step", async () => {
	const records = [
		{ id: "checking", isDefaultForStatements: false, isPrimary: false },
		{ id: "savings", isDefaultForStatements: false, isPrimary: true },
	];
	let statementWrites = 0;
	let primaryWrites = 0;
	let failPrimary = true;
	const accounts = {
		getAll: async () => records.map(record => ({ ...record })),
		setPrimary: async (id: string | null) => {
			primaryWrites++;
			if (failPrimary) {
				failPrimary = false;
				throw new Error("Primary account temporarily unavailable");
			}
			for (const record of records) record.isPrimary = record.id === id;
		},
		update: async (id: string, input: { isDefaultForStatements: boolean }) => {
			statementWrites++;
			for (const record of records)
				record.isDefaultForStatements = record.id === id && input.isDefaultForStatements;
		},
	};
	const draft = { primaryId: "checking", statementId: "checking" };
	await expect(saveAccountDefaults(draft, accounts)).rejects.toThrow("temporarily unavailable");
	await saveAccountDefaults(draft, accounts);
	expect(statementWrites).toBe(1);
	expect(primaryWrites).toBe(2);
	expect(records[0]?.isPrimary).toBeTrue();
	expect(records[0]?.isDefaultForStatements).toBeTrue();
});
