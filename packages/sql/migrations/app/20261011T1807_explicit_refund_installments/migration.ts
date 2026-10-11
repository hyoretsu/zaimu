#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/9f840a405d649c3fa6ef9a9d4af38b1f642206ec8357ae2ca6eb945bdc1a8fb8/contract";
import endContract from "../../snapshots/9f840a405d649c3fa6ef9a9d4af38b1f642206ec8357ae2ca6eb945bdc1a8fb8/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/c5c462322a1b1481675cffa01de1e1f19d479fae16d169afb8cbc62857bf3dac/contract";
import startContract from "../../snapshots/c5c462322a1b1481675cffa01de1e1f19d479fae16d169afb8cbc62857bf3dac/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("canceledInstallmentNumbers", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "CreditRefundRecord",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
