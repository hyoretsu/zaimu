import { readFileSync } from "node:fs";
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/489fa825bbec65c03cbedcfb5f9392b3e81f364964be9deadd99a8e829aa13cf/contract";
import endContract from "../../snapshots/489fa825bbec65c03cbedcfb5f9392b3e81f364964be9deadd99a8e829aa13cf/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/dcd9827e30f5e5c90521b127eb7cad4d1bd128c76b3328c3d93e7b79b01b225b/contract";
import startContract from "../../snapshots/dcd9827e30f5e5c90521b127eb7cad4d1bd128c76b3328c3d93e7b79b01b225b/contract.json" with {
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
						description: "Transactional audit and cutover",
						sql: readFileSync(new URL("./cutover.sql", import.meta.url), "utf8"),
					},
				],
				id: "finance.removeLegacy",
				label: "Transfer audited credit reviews and scalar tag associations",
				operationClass: "destructive",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}
MigrationCLI.run(import.meta.url, M);
