import "dotenv/config";
import { definePrismaConfig } from "@prisma/cli-engine";
import { defineConfig } from "@prisma/orm-postgres/config";

// Historical execution only. Never imported by the application runtime.
export default definePrismaConfig({
	orm: defineConfig({
		contract: "./src/prisma/contract.prisma",
		db: { connection: process.env.DATABASE_URL! },
		output: "./out/prisma",
	}),
});
