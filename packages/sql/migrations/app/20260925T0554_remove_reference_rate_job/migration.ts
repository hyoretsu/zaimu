#!/usr/bin/env -S node
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/4da73ccb3f5e31202eee1e2b6f409a8759a1998f2128de4ae30894bccb2ce11b/contract";
import startContract from "../../snapshots/4da73ccb3f5e31202eee1e2b6f409a8759a1998f2128de4ae30894bccb2ce11b/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/7d3cd303e002cc19fb1eca208fe0e84771c9b12863e59dbb89691231cf7f5a16/contract";
import endContract from "../../snapshots/7d3cd303e002cc19fb1eca208fe0e84771c9b12863e59dbb89691231cf7f5a16/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			rawSql(`INSERT INTO "public"."OutboxEvent" (
        "id", "eventType", "aggregateType", "aggregateId", "userIds", "occurredAt",
        "schemaVersion", "correlationId", "payload"
      )
      SELECT
        job."id",
        CASE job."kind"
          WHEN 'FETCH_RATES' THEN 'command.reference-rate-fetch'
          ELSE 'command.account-yield-recalculation'
        END,
        'referenceRate',
        COALESCE(job."financialAccountId", job."referenceType"::text),
        ARRAY[]::varchar(36)[],
        job."createdAt",
        1,
        job."id",
        CASE job."kind"
          WHEN 'FETCH_RATES' THEN json_build_object(
            'deduplicationKey', job."deduplicationKey",
            'referenceType', job."referenceType",
            'startDate', job."startDate",
            'endDate', job."endDate"
          )
          ELSE json_build_object(
            'deduplicationKey', job."deduplicationKey",
            'financialAccountId', job."financialAccountId",
            'fromDate', job."fromDate"
          )
        END
      FROM "public"."ReferenceRateJob" job
      WHERE job."completedAt" IS NULL
      ON CONFLICT ("id") DO NOTHING;`),
			this.dropTable({ schema: "public", table: "ReferenceRateJob" }),
			this.dropNativeEnumType({ schema: "public", typeName: "ReferenceRateJobKind" }),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
