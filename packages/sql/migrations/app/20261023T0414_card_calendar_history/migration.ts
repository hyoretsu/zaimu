#!/usr/bin/env -S node
import { col, Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/320ba06501615adedddd0a4cd18524419a53f82f25a8509957c08f14d673e539/contract";
import endContract from "../../snapshots/320ba06501615adedddd0a4cd18524419a53f82f25a8509957c08f14d673e539/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/67361220fdee9916e7d6c4fa81a5e2b11c225fd8b960860a9e25e08b841ba440/contract";
import startContract from "../../snapshots/67361220fdee9916e7d6c4fa81a5e2b11c225fd8b960860a9e25e08b841ba440/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("calendarHistory", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "CreditCard",
			}),
			rawSql({
				execute: [
					{
						description: "Nubank transition defaults",
						sql: `UPDATE "FinancialInstitution" SET "creditCardRules"=('{"cashback":null,"workingDueDate":true,"transitionMode":"EXTRA_CYCLE","installmentMode":"PER_CYCLE"}'::jsonb || COALESCE("creditCardRules"::jsonb,'{}'::jsonb))::json WHERE lower("name")='nubank';
UPDATE "FinancialInstitutionProfile" p SET "creditCardRules"=('{"cashback":null,"workingDueDate":true,"transitionMode":"EXTRA_CYCLE","installmentMode":"PER_CYCLE"}'::jsonb || p."creditCardRules"::jsonb)::json FROM "FinancialInstitution" i WHERE i.id=p."institutionId" AND lower(i.name)='nubank' AND p."creditCardRules" IS NOT NULL;`,
					},
				],
				id: "creditCard.nubankCycleDefaults",
				invariantId: "creditCard.nubankCycleDefaults.v1",
				label: "Set Nubank cycle transition defaults without changing existing rules",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
