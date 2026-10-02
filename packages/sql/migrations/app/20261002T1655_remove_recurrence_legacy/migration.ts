import { readFileSync } from "node:fs";
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/2959d551a33a438c69e904f3222fb3b053b98e9f92be5a047827b7e5853f53a0/contract";
import endContract from "../../snapshots/2959d551a33a438c69e904f3222fb3b053b98e9f92be5a047827b7e5853f53a0/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/b4328c2e5326cafd71f37360fd24ab0693c2cda1659dbd592cbe0c35408bbeae/contract";
import startContract from "../../snapshots/b4328c2e5326cafd71f37360fd24ab0693c2cda1659dbd592cbe0c35408bbeae/contract.json" with {
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
				id: "recurrence.removeLegacy",
				label: "Remove audited recurrence legacy and rename current references",
				operationClass: "destructive",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}
MigrationCLI.run(import.meta.url, M);
