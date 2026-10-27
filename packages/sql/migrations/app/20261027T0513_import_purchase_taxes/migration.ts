#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/761180a121bb1b5cbb68975d303828540dccb199deacc27099061aa25b8bcb86/contract";
import startContract from "../../snapshots/761180a121bb1b5cbb68975d303828540dccb199deacc27099061aa25b8bcb86/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/e62659443b204cad0a50646e6e1e1ff44b659d6ed4ee5ee36f7da9633e32cdad/contract";
import endContract from "../../snapshots/e62659443b204cad0a50646e6e1e1ff44b659d6ed4ee5ee36f7da9633e32cdad/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("taxSourceExternalIds", "json", {
					codecRef: { codecId: "pg/json@1" },
					default: lit([]),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addColumn({
				column: col("taxes", "json", {
					codecRef: { codecId: "pg/json@1" },
					default: lit([]),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCardImportItem",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
