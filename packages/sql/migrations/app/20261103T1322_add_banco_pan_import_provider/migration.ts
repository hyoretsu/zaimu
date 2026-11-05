#!/usr/bin/env -S node
import { Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/7c4f89dec910830b905b2b49e39826a4b35ebebb6f01cdcd35c2b73d88e84dad/contract";
import startContract from "../../snapshots/7c4f89dec910830b905b2b49e39826a4b35ebebb6f01cdcd35c2b73d88e84dad/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/36ad3ae2746e9ee87dbdc52a338fe5b6819aa05f876a373bb837f36c75cce2ad/contract";
import endContract from "../../snapshots/36ad3ae2746e9ee87dbdc52a338fe5b6819aa05f876a373bb837f36c75cce2ad/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({
				schema: "public",
				typeName: "TransactionImportProvider",
				value: "BANCO_PAN",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
