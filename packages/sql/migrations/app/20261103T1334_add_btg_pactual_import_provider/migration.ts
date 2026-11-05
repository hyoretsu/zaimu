#!/usr/bin/env -S node
import { Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/36ad3ae2746e9ee87dbdc52a338fe5b6819aa05f876a373bb837f36c75cce2ad/contract";
import startContract from "../../snapshots/36ad3ae2746e9ee87dbdc52a338fe5b6819aa05f876a373bb837f36c75cce2ad/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/e9314176a235e1d9504581f63eda312f691ee25794386f66e903d0e481b6883f/contract";
import endContract from "../../snapshots/e9314176a235e1d9504581f63eda312f691ee25794386f66e903d0e481b6883f/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({
				schema: "public",
				typeName: "TransactionImportProvider",
				value: "BTG_PACTUAL",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
