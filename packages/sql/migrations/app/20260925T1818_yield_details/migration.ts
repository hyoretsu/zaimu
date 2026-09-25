#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/97d55fc84368776ed927a05daa6b3b2e86ddb17af737bc2f2302b2e569ffbd36/contract";
import startContract from "../../snapshots/97d55fc84368776ed927a05daa6b3b2e86ddb17af737bc2f2302b2e569ffbd36/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/e9fb01d490bedf38a3e09337c235076db774e4cd163c7c06aa057f8f8a24372d/contract";
import endContract from "../../snapshots/e9fb01d490bedf38a3e09337c235076db774e4cd163c7c06aa057f8f8a24372d/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("isHidden", "bool", {
					codecRef: { codecId: "pg/bool@1" },
					default: lit(false),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialAccountYield",
			}),
			this.addColumn({
				column: col("time", "time(3)", {
					codecRef: { codecId: "pg/time@1", typeParams: { precision: 3 } },
				}),
				schema: "public",
				table: "FinancialAccountYield",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
