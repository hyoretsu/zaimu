#!/usr/bin/env -S node
import { Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/09a0ed2c043a8a801fde68e2ed31cf0a91d354dcc805f5a24a172c08d14eb613/contract";
import endContract from "../../snapshots/09a0ed2c043a8a801fde68e2ed31cf0a91d354dcc805f5a24a172c08d14eb613/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/24dd033e53c7c6cd8dc8338a19c437e7cfe290d63812b0f8a2d07118d9532068/contract";
import startContract from "../../snapshots/24dd033e53c7c6cd8dc8338a19c437e7cfe290d63812b0f8a2d07118d9532068/contract.json" with {
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
				value: "INTER",
			}),
			this.addNativeEnumValue({
				schema: "public",
				typeName: "CreditCardImportProvider",
				value: "NUBANK",
			}),
			this.addNativeEnumValue({
				schema: "public",
				typeName: "CreditCardImportProvider",
				value: "PICPAY",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
