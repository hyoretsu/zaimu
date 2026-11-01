import "dotenv/config";
import { defineConfig as definePostgresConfig } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";

export default definePrismaConfig({
	orm: definePostgresConfig({
		contract: "./src/prisma/contract.prisma",
		db: {
			connection: process.env.DATABASE_URL!,
		},
		// Immutable early-RC history is replayed separately; new migrations use only native snapshots.
		migrations: { dir: "./migrations-native" },
		output: "./out/prisma",
	}),
});
