import { readFileSync } from "node:fs";
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/2959d551a33a438c69e904f3222fb3b053b98e9f92be5a047827b7e5853f53a0/contract";
import startContract from "../../snapshots/2959d551a33a438c69e904f3222fb3b053b98e9f92be5a047827b7e5853f53a0/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/dcd9827e30f5e5c90521b127eb7cad4d1bd128c76b3328c3d93e7b79b01b225b/contract";
import endContract from "../../snapshots/dcd9827e30f5e5c90521b127eb7cad4d1bd128c76b3328c3d93e7b79b01b225b/contract.json" with {
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
				id: "debt.removeLegacy",
				label: "Remove audited debt legacy and retain current event tombstones",
				operationClass: "destructive",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}
MigrationCLI.run(import.meta.url, M);
