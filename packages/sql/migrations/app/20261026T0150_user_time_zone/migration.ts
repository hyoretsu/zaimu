#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/95c4234910918e5daa3b156a778ce3e3a696bee90370030e35c567f6824e2dec/contract";
import startContract from "../../snapshots/95c4234910918e5daa3b156a778ce3e3a696bee90370030e35c567f6824e2dec/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/761180a121bb1b5cbb68975d303828540dccb199deacc27099061aa25b8bcb86/contract";
import endContract from "../../snapshots/761180a121bb1b5cbb68975d303828540dccb199deacc27099061aa25b8bcb86/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("preferredTimeZone", "character varying(100)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
				}),
				schema: "public",
				table: "user",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
