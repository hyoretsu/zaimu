import { Pool } from "pg";

const email = process.argv[2];
if (!email) throw new Error("Uso: bun src/scripts/promote-admin.ts email [--install-role]");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
try {
	await client.query("BEGIN");
	const users = await client.query(`SELECT "id" FROM "user" WHERE lower("email")=lower($1) FOR UPDATE`, [
		email,
	]);
	if (users.rows.length !== 1) throw new Error("Esperado exatamente um usuário já cadastrado.");
	if (process.argv.includes("--install-role")) {
		await client.query(
			`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" varchar(10) NOT NULL DEFAULT 'USER'`,
		);
		const constraint = await client.query(
			`SELECT 1 FROM pg_constraint WHERE conrelid='"user"'::regclass AND conname='user_role_check'`,
		);
		if (!constraint.rows.length)
			await client.query(
				`ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK ("role" IN ('USER','ADMIN'))`,
			);
	}
	await client.query(`UPDATE "user" SET "role"='ADMIN',"updatedAt"=now() WHERE "id"=$1`, [users.rows[0].id]);
	const result = await client.query(`SELECT "email","role" FROM "user" WHERE "id"=$1`, [users.rows[0].id]);
	await client.query("COMMIT");
	console.log(result.rows[0]);
} catch (error) {
	await client.query("ROLLBACK");
	throw error;
} finally {
	client.release();
	await pool.end();
}
