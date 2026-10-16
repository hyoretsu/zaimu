#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/a1ae3881cd04135404e1bab46e48e087300ea0e14eb9127fbfe389cb529b2dba/contract";
import startContract from "../../snapshots/a1ae3881cd04135404e1bab46e48e087300ea0e14eb9127fbfe389cb529b2dba/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/ea63235da6210f75d4fdd40fac6de41099feaf5e62774f86e8ee0ce4a06c202e/contract";
import endContract from "../../snapshots/ea63235da6210f75d4fdd40fac6de41099feaf5e62774f86e8ee0ce4a06c202e/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("manualTotalAmount", "numeric(20,6)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
				}),
				schema: "public",
				table: "CreditCardStatement",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
