#!/usr/bin/env -S node
import { col, fn, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/759f786ef657d499f89b54897bb28412cd3600c0dea895f55564031fe8ab02de/contract";
import startContract from "../../snapshots/759f786ef657d499f89b54897bb28412cd3600c0dea895f55564031fe8ab02de/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/e6f952d8b8937cd3db66ef01b911c808e91e407738cd3f63387ad6c760107756/contract";
import endContract from "../../snapshots/e6f952d8b8937cd3db66ef01b911c808e91e407738cd3f63387ad6c760107756/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("firstTransactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("secondTransactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "TransactionTransferSuggestionRejection_pkey" })],
				schema: "public",
				table: "TransactionTransferSuggestionRejection",
			}),
			this.createIndex({
				columns: ["userId", "firstTransactionId", "secondTransactionId"],
				extras: { unique: true },
				index: "TransactionTransferSuggestionRejection_pair_key",
				schema: "public",
				table: "TransactionTransferSuggestionRejection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "TransactionTransferSuggestionRejection_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "TransactionTransferSuggestionRejection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["firstTransactionId"],
					name: "TransactionTransferSuggestionRejection_firstTransactionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Transaction" },
				},
				schema: "public",
				table: "TransactionTransferSuggestionRejection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["secondTransactionId"],
					name: "TransactionTransferSuggestionRejection_secondTransactionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Transaction" },
				},
				schema: "public",
				table: "TransactionTransferSuggestionRejection",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
