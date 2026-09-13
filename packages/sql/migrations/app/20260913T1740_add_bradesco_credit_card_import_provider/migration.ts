#!/usr/bin/env -S node
import { Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/24dd033e53c7c6cd8dc8338a19c437e7cfe290d63812b0f8a2d07118d9532068/contract";
import endContract from "../../snapshots/24dd033e53c7c6cd8dc8338a19c437e7cfe290d63812b0f8a2d07118d9532068/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/744a8b6e91fe1fceb7f2a49c9a168f13b4a1f5eebab349acdc41172b83e8f75e/contract";
import startContract from "../../snapshots/744a8b6e91fe1fceb7f2a49c9a168f13b4a1f5eebab349acdc41172b83e8f75e/contract.json" with {
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
				value: "BRADESCO",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
