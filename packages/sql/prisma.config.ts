import "dotenv/config";
import { defineConfig as definePostgresConfig } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";

export default definePrismaConfig({
	orm: definePostgresConfig({
		contract: "./src/prisma/contract.prisma",
		db: {
			connection: process.env.DATABASE_URL!,
		},
		migrations: { dir: "./migrations" },
		output: "./out/prisma",
	}),
});
