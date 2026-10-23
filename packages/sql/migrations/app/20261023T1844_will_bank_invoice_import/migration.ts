#!/usr/bin/env -S node
import { Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/320ba06501615adedddd0a4cd18524419a53f82f25a8509957c08f14d673e539/contract";
import startContract from "../../snapshots/320ba06501615adedddd0a4cd18524419a53f82f25a8509957c08f14d673e539/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/b6730f0255e5a0abf6ae23a85cd04bcea524c995542aa90bd66c8de32df81945/contract";
import endContract from "../../snapshots/b6730f0255e5a0abf6ae23a85cd04bcea524c995542aa90bd66c8de32df81945/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({
				schema: "public",
				typeName: "CreditCardImportProvider",
				value: "WILL_BANK",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
