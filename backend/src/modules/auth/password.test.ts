import { describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "./password";

describe("credenciais Better Auth", () => {
	test("aceita hashes bcrypt migrados", async () => {
		const legacyHash = await Bun.password.hash("senha-legada", { algorithm: "bcrypt", cost: 10 });
		expect(await verifyPassword({ hash: legacyHash, password: "senha-legada" })).toBe(true);
		expect(await verifyPassword({ hash: legacyHash, password: "senha-incorreta" })).toBe(false);
	});

	test("cria novos hashes bcrypt", async () => {
		const hash = await hashPassword("senha-nova-segura");
		expect(hash.startsWith("$2")).toBe(true);
		expect(await verifyPassword({ hash, password: "senha-nova-segura" })).toBe(true);
	}, 60_000);
});
