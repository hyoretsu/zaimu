#!/usr/bin/env -S node
import { col, Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/0567ee71a30f4562462e07ff2776133815a39ed36b3807bdeafbfa0e1527e22e/contract";
import endContract from "../../snapshots/0567ee71a30f4562462e07ff2776133815a39ed36b3807bdeafbfa0e1527e22e/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/a92b1f7f1f3a857567384af7b56de1a1e8aec7e149dd069ab662f5b4e1263ac0/contract";
import startContract from "../../snapshots/a92b1f7f1f3a857567384af7b56de1a1e8aec7e149dd069ab662f5b4e1263ac0/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("legacyYieldCalendar", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "FinancialAccount",
			}),
			rawSql({
				execute: [
					{
						description: "Preserve historical derived yield calendar",
						sql: `UPDATE "FinancialAccount" a SET "legacyYieldCalendar"=json_build_object('throughDate',CURRENT_DATE::text,'holidays',COALESCE((SELECT json_agg(DISTINCT h."date"::text) FROM "YieldCalendarHoliday" h JOIN "YieldCalendarCurrency" c ON c."countryCode"=h."countryCode" WHERE c."currency"=a."currency"),'[]'::json)) WHERE a."legacyYieldCalendar" IS NULL`,
					},
				],
				id: "legacyYieldCalendar.freeze",
				invariantId: "legacyYieldCalendar.frozen.v1",
				label: "Freeze pre-migration calendar per existing account",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
