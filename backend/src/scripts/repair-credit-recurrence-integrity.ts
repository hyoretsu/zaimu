import { closeDatabase, queryRaw, withRawTransaction } from "~/shared/infra/sql";

try {
	const args = process.argv.slice(2);
	if (args.some(arg => arg !== "--apply" && arg !== "--help"))
		throw new Error("Use schedule:repair-integrity [--apply]. Sem --apply, somente mostra a correção.");
	const sql = await Bun.file(
		new URL("../../../packages/sql/scripts/repair-credit-recurrence-integrity.sql", import.meta.url),
	).text();
	if (args.includes("--help") || !args.includes("--apply")) {
		console.log(
			"Corrige referências antigas no trigger de integridade de compras, preservando demais validações. Execute com --apply para gravar no banco configurado em DATABASE_URL.",
		);
		console.log(sql);
	} else {
		await withRawTransaction(() => queryRaw(sql));
		console.log(
			"Trigger de integridade de compras corrigido. Repita schedule:repair para recuperar ocorrências ausentes.",
		);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	await closeDatabase();
}
