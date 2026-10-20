#!/usr/bin/env -S node
import { readFileSync } from "node:fs";
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/47dfd2cc3f102e59fd3d5eb8789ff33245bb6bf56b83a628de086e2f5d6eff79/contract";
import endContract from "../../snapshots/47dfd2cc3f102e59fd3d5eb8789ff33245bb6bf56b83a628de086e2f5d6eff79/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/ea63235da6210f75d4fdd40fac6de41099feaf5e62774f86e8ee0ce4a06c202e/contract";
import startContract from "../../snapshots/ea63235da6210f75d4fdd40fac6de41099feaf5e62774f86e8ee0ce4a06c202e/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			rawSql({
				execute: [
					{
						description: "Keep one authoritative yield per account and date",
						sql: readFileSync(new URL("./deduplicate.sql", import.meta.url), "utf8"),
					},
				],
				id: "financialAccountYield.deduplicate",
				label: "Keep reported yields and preserve synchronization links",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
			this.dropIndex({
				index: "FinancialAccountYield_accountId_date_kind_key",
				schema: "public",
				table: "FinancialAccountYield",
			}),
			this.createIndex({
				columns: ["financialAccountId", "date"],
				extras: { unique: true },
				index: "FinancialAccountYield_accountId_date_key",
				schema: "public",
				table: "FinancialAccountYield",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
