import { format } from "date-fns";
import { getReferenceRateAverages } from "~/modules/reference-rates/application/get-reference-rate-averages";
import { handleReferenceRateFetchCommand } from "~/modules/reference-rates/application/reference-rate-jobs";
import { fetchBcbReferenceRates } from "~/modules/reference-rates/domain/bcb-reference-rates";
import { referenceRateBootstrapIntervals } from "~/modules/reference-rates/domain/reference-rate-window";
import { namespacesForEvent } from "~/shared/application/cache-invalidation";
import { createEventEnvelope } from "~/shared/application/events";
import { withWorkerCacheWrite } from "~/shared/infra/cache/worker-cache-write";
import { brokerQueue } from "~/shared/infra/service-namespace";
import { closeDatabase, queryRaw } from "~/shared/infra/sql";

const help = `Checa e completa dez anos de CDI/Selic sem sobrescrever taxas existentes.
Uso: bun run rates:repair [--status-only] [--apply]
Sem --apply: consulta banco e BCB, informa ausências e divergências, sem gravar.
--status-only: consulta somente banco, cobertura e estado dos comandos.
--apply: coleta diretamente, sem depender do consumidor RabbitMQ; mantém cache
coerente e enfileira recálculos de rendimento pelo fluxo existente.
Feriados e dias sem publicação não são considerados lacunas.
Usa DATABASE_URL, REDIS_URL e SERVICE_NAMESPACE do ambiente configurado.`;

async function status() {
	console.log("Cobertura:", await getReferenceRateAverages());
	console.table(
		await queryRaw(`SELECT "type", count(*)::int AS registros,
 min("date") AS primeira, max("date") AS ultima, max("updatedAt") AS atualizacao
 FROM "ReferenceRate" GROUP BY "type"`),
	);
	console.table(
		await queryRaw(
			`SELECT e."payload"->>'referenceType' AS indice,
 e."payload"->>'startDate' AS inicio, e."payload"->>'endDate' AS fim,
 e."occurredAt" AS criado, e."publishedAt" AS publicado,
 r."completedAt" AS concluido, r."lockedUntil" AS lease,
 r."attempts" AS falhas, COALESCE(r."lastError",e."lastError") AS erro
 FROM "OutboxEvent" e LEFT JOIN "ConsumerReceipt" r
 ON r."eventId"=e."id" AND r."consumer"=$1
 WHERE e."eventType"='command.reference-rate-fetch'
 ORDER BY e."occurredAt" DESC LIMIT 12`,
			[brokerQueue("reference-rate-fetch")],
		),
	);
	console.log(
		"Publicado não significa concluído. Lease não comprova progresso; compare registros e conclusão entre consultas. Erros com retries esgotados exigem reparo.",
	);
}

async function main() {
	const args = process.argv.slice(2);
	if (args.includes("--help")) return console.log(help);
	for (const arg of args) {
		if (!["--apply", "--status-only"].includes(arg)) throw new Error(`Opção desconhecida: ${arg}`);
	}
	if (args.includes("--apply") && args.includes("--status-only"))
		throw new Error("--status-only não pode ser combinado com --apply");
	await status();
	if (args.includes("--status-only")) return;
	const apply = args.includes("--apply");
	const run = crypto.randomUUID();
	let failures = 0;
	for (const { startDate, endDate } of referenceRateBootstrapIntervals(new Date())) {
		for (const type of ["CDI", "SELIC"] as const) {
			const start = format(startDate, "yyyy-MM-dd");
			const end = format(endDate, "yyyy-MM-dd");
			try {
				const rates = await fetchBcbReferenceRates(type, startDate, endDate);
				if (!rates.length) throw new Error("BCB retornou intervalo anual vazio; cobertura não será marcada");
				if (
					rates.some(rate => {
						const date = format(rate.date, "yyyy-MM-dd");
						return date < start || date > end;
					})
				)
					throw new Error("BCB retornou taxa fora do intervalo solicitado; nenhuma gravação realizada");
				const stored = await queryRaw<{ date: string; value: number }>(
					`SELECT to_char("date",'YYYY-MM-DD') AS date, "value" FROM "ReferenceRate"
 WHERE "type"=$1 AND "date" BETWEEN $2::date AND $3::date`,
					[type, start, end],
				);
				const values = new Map(stored.map(row => [row.date, Number(row.value)]));
				const missing = rates.filter(rate => !values.has(format(rate.date, "yyyy-MM-dd")));
				const different = rates.filter(rate => {
					const value = values.get(format(rate.date, "yyyy-MM-dd"));
					return value !== undefined && value !== rate.value;
				});
				console.log(
					`${type} ${start} - ${end}: ${rates.length} publicadas, ${missing.length} ausentes, ${different.length} divergentes (preservadas).`,
				);
				if (!apply) continue;
				const event = createEventEnvelope({
					aggregateId: type,
					aggregateType: "referenceRate",
					correlationId: run,
					eventType: "command.reference-rate-fetch",
					payload: {
						deduplicationKey: `repair:${run}:${type}:${start}:${end}`,
						endDate: end,
						referenceType: type,
						startDate: start,
					},
					userIds: [],
				});
				const owners = await queryRaw<{ userId: string }>(
					`SELECT DISTINCT "userId" FROM "FinancialAccount" WHERE "type" <> 'CREDIT_CARD'`,
				);
				await withWorkerCacheWrite(
					owners.map(row => row.userId),
					namespacesForEvent(event),
					() => handleReferenceRateFetchCommand(event, async () => rates, { preserveExisting: true }),
				);
				console.log(`${type} ${start}: preenchimento e cobertura confirmados.`);
			} catch (error) {
				failures++;
				console.error(`${type} ${start} - ${end}:`, error instanceof Error ? error.message : String(error));
			}
		}
	}
	await status();
	if (failures)
		throw new Error(
			`${failures} intervalos falharam. Reexecute após corrigir causa; preenchimento é idempotente.`,
		);
	if (!apply)
		console.log("Simulação concluída. Use --apply para completar taxas e registrar cobertura verificada.");
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	await closeDatabase();
}
