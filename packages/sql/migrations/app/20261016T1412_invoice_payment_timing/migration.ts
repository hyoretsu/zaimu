#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/a1ae3881cd04135404e1bab46e48e087300ea0e14eb9127fbfe389cb529b2dba/contract";
import endContract from "../../snapshots/a1ae3881cd04135404e1bab46e48e087300ea0e14eb9127fbfe389cb529b2dba/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/c4edc511da606d6f56de1ba919432d200f7ceba27af5790c599578b05989b88f/contract";
import startContract from "../../snapshots/c4edc511da606d6f56de1ba919432d200f7ceba27af5790c599578b05989b88f/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("invoicePaymentTiming", "character varying(12)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 12 } },
					default: lit("DUE_DATE"),
					notNull: true,
				}),
				schema: "public",
				table: "user",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
