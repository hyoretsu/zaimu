#!/usr/bin/env -S node
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type {
	Contract as End,
	Contract as Start,
} from "../../snapshots/3396a7ca1c28bf16ba91ad4c1a4d5fda50876f2b6643c75389c497440205b3cd/contract";
import endContract from "../../snapshots/3396a7ca1c28bf16ba91ad4c1a4d5fda50876f2b6643c75389c497440205b3cd/contract.json" with {
	type: "json",
};
import startContract from "../../snapshots/3396a7ca1c28bf16ba91ad4c1a4d5fda50876f2b6643c75389c497440205b3cd/contract.json" with {
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
						description: "Replace monthly budget value validation for organizational budgets",
						sql: 'ALTER TABLE "public"."MonthlyBudget" DROP CONSTRAINT "MonthlyBudget_values_check", ADD CONSTRAINT "MonthlyBudget_values_check" CHECK ((("source"=\'UNCATEGORIZED\' AND "amount">=0) OR ("source"<>\'UNCATEGORIZED\' AND "amount">0)) AND "currency" ~ \'^[A-Z]{3}$\' AND "source" IN (\'TAG\',\'STATEMENTS\',\'CUSTOM\',\'RESERVE\',\'UNCATEGORIZED\') AND (("source"=\'TAG\')=("categoryId" IS NOT NULL)) AND "startMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND ("endMonth" IS NULL OR ("endMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND "endMonth">="startMonth")))',
					},
				],
				id: "monthlyBudget.uncategorizedValues",
				invariantId: "monthlyBudget.uncategorizedValues.v1",
				label: "Allow organizational budgets without a positive amount",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: {
					id: "postgres",
				},
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
