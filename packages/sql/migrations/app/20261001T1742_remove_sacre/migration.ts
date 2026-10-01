#!/usr/bin/env -S node
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/11f7200adb8f9fa981d3d0aab7b6e9c8c444c027f08f182ed0a956f99a387992/contract";
import startContract from "../../snapshots/11f7200adb8f9fa981d3d0aab7b6e9c8c444c027f08f182ed0a956f99a387992/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/f455efbeae9a441e883befa794486f417ce17c903acc3e5fe483c941ed82879d/contract";
import endContract from "../../snapshots/f455efbeae9a441e883befa794486f417ce17c903acc3e5fe483c941ed82879d/contract.json" with {
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
						description: "Replace enum while preserving loan records",
						sql: `LOCK TABLE "Loan" IN ACCESS EXCLUSIVE MODE;
DO $review$ BEGIN
 IF EXISTS (SELECT 1 FROM "Loan" WHERE "amortization"::text = 'SACRE') THEN
  RAISE EXCEPTION 'Review SACRE loans and select PRICE or SAC before this migration';
 END IF;
END $review$;
ALTER TABLE "Loan" ALTER COLUMN "amortization" DROP DEFAULT;
ALTER TYPE "AmortizationType" RENAME TO "AmortizationType_legacy";
CREATE TYPE "AmortizationType" AS ENUM ('PRICE', 'SAC');
ALTER TABLE "Loan" ALTER COLUMN "amortization" TYPE "AmortizationType" USING "amortization"::text::"AmortizationType";
ALTER TABLE "Loan" ALTER COLUMN "amortization" SET DEFAULT 'PRICE'::"AmortizationType";
DROP TYPE "AmortizationType_legacy";`,
					},
				],
				id: "loans.removeSacre",
				label: "Remove unsupported amortization after explicit legacy review",
				operationClass: "destructive",
				postcheck: [
					{
						description: "Enum exposes only supported amortizations",
						sql: `SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) = ARRAY['PRICE', 'SAC'] AS result FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'AmortizationType' AND n.nspname = 'public'`,
					},
				],
				precheck: [
					{
						description: "No loan still uses removed amortization",
						sql: `SELECT NOT EXISTS (SELECT 1 FROM "Loan" WHERE "amortization"::text = 'SACRE') AS result`,
					},
				],
				target: { id: "postgres" },
			}),
		];
	}
}
MigrationCLI.run(import.meta.url, M);
