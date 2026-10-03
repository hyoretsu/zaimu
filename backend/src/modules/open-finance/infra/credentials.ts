import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { HttpException } from "~/shared/errors";

export interface PluggyCredentials {
	clientId: string;
	clientSecret: string;
}

function encryptionKey() {
	const encoded = process.env.OPEN_FINANCE_ENCRYPTION_KEY;
	if (!encoded || !/^[\da-f]{64}$/i.test(encoded)) return null;
	return Buffer.from(encoded, "hex");
}
export const openFinanceAvailable = () => encryptionKey() !== null;
function requireKey() {
	const key = encryptionKey();
	if (!key)
		throw new HttpException("Open Finance indisponível. Configure a chave de criptografia no servidor.", 503);
	return key;
}
export function encryptCredentials(userId: string, credentials: PluggyCredentials) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", requireKey(), iv);
	cipher.setAAD(Buffer.from(userId));
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
	return [
		"v1",
		iv.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		ciphertext.toString("base64url"),
	].join(".");
}
export function decryptCredentials(userId: string, encoded: string): PluggyCredentials {
	try {
		const [version, iv, tag, ciphertext] = encoded.split(".");
		if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid envelope");
		const decipher = createDecipheriv("aes-256-gcm", requireKey(), Buffer.from(iv, "base64url"));
		decipher.setAAD(Buffer.from(userId));
		decipher.setAuthTag(Buffer.from(tag, "base64url"));
		return JSON.parse(
			Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString(
				"utf8",
			),
		);
	} catch {
		throw new HttpException("Não foi possível ler as credenciais. Configure a integração novamente.", 503);
	}
}
