#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/95c4234910918e5daa3b156a778ce3e3a696bee90370030e35c567f6824e2dec/contract";
import endContract from "../../snapshots/95c4234910918e5daa3b156a778ce3e3a696bee90370030e35c567f6824e2dec/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/b6730f0255e5a0abf6ae23a85cd04bcea524c995542aa90bd66c8de32df81945/contract";
import startContract from "../../snapshots/b6730f0255e5a0abf6ae23a85cd04bcea524c995542aa90bd66c8de32df81945/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("refundReview", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "CreditCardImportItem",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
