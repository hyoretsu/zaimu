#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/9c8075d9409735492c38278eb8c9a2d855797d4b05bbe2996411573ebb186cfc/contract";
import startContract from "../../snapshots/9c8075d9409735492c38278eb8c9a2d855797d4b05bbe2996411573ebb186cfc/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/e61535f5142cd65c9293b4ef5a7c5dbe4168016ee072a41f756a41405f5e67b7/contract";
import endContract from "../../snapshots/e61535f5142cd65c9293b4ef5a7c5dbe4168016ee072a41f756a41405f5e67b7/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("dayOfWeek", "int2", { codecRef: { codecId: "pg/int2@1" } }),
				schema: "public",
				table: "Salary",
			}),
			this.addColumn({
				column: col("dayOfWeek", "int2", { codecRef: { codecId: "pg/int2@1" } }),
				schema: "public",
				table: "Subscription",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
