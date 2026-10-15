#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/1af6555f5c8abd8ae4855fa102dc56268efae3f3ff4aa9d11bf5c4c484bf5833/contract";
import endContract from "../../snapshots/1af6555f5c8abd8ae4855fa102dc56268efae3f3ff4aa9d11bf5c4c484bf5833/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/d2183e727953a3c8a7f1af3bc9c563c061539dfa4da4f82745bd6e994244ee70/contract";
import startContract from "../../snapshots/d2183e727953a3c8a7f1af3bc9c563c061539dfa4da4f82745bd6e994244ee70/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("accountCurrenciesByCountry", "json", {
					codecRef: { codecId: "pg/json@1" },
					default: lit({}),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitution",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
