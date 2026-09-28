#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/a08745da75bf1dc6481b60f5dbbb59e2bc58c5a1e5ffc7a24cd64884daa36a66/contract";
import endContract from "../../snapshots/a08745da75bf1dc6481b60f5dbbb59e2bc58c5a1e5ffc7a24cd64884daa36a66/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/c85f8f1f993bf14eb7dca699c172a516292a539673d966ee74d9f7a5beaae778/contract";
import startContract from "../../snapshots/c85f8f1f993bf14eb7dca699c172a516292a539673d966ee74d9f7a5beaae778/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("ignoreStatementsBefore", "date", { codecRef: { codecId: "pg/date@1" } }),
				schema: "public",
				table: "CreditCard",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
