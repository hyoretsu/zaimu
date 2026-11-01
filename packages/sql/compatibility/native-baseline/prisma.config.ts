import { defineConfig } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";

// Emitted with prisma rc29, runtime/toolchain/framework rc22; no historical source edits.
export default definePrismaConfig({
	orm: defineConfig({
		contract: "./contract.prisma",
		db: { connection: process.env.DATABASE_URL! },
		migrations: { dir: "./migrations" },
		output: "./emitted",
	}),
});
