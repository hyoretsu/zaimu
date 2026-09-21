#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/e6f952d8b8937cd3db66ef01b911c808e91e407738cd3f63387ad6c760107756/contract";
import startContract from "../../snapshots/e6f952d8b8937cd3db66ef01b911c808e91e407738cd3f63387ad6c760107756/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/e40ebc41b7b69021378d2fd198294aaeddcf6494bf266af9ebf034fe5bb5064b/contract";
import endContract from "../../snapshots/e40ebc41b7b69021378d2fd198294aaeddcf6494bf266af9ebf034fe5bb5064b/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("isDuplicateIgnored", "bool", {
					codecRef: { codecId: "pg/bool@1" },
					default: lit(false),
					notNull: true,
				}),
				schema: "public",
				table: "TransactionImportItem",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
