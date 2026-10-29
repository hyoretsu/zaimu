#!/usr/bin/env -S node
import { Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/1ce00365762f398d639512abcc6b130d22364beea5f36452debb2fdb137caa62/contract";
import endContract from "../../snapshots/1ce00365762f398d639512abcc6b130d22364beea5f36452debb2fdb137caa62/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/91403cb5c3f8f100e98f710b7cf15733f5668ecc41cf5f663aacf0767e9a071c/contract";
import startContract from "../../snapshots/91403cb5c3f8f100e98f710b7cf15733f5668ecc41cf5f663aacf0767e9a071c/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.dropDefault({
				column: "currency",
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.dropNotNull({
				column: "currency",
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
