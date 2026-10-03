import { recurrenceDateKey, recurrenceNeedsConfiguration } from "@zaimu/finance/recurrence";
import {
	getStoredRecurrence,
	materializeRecurrence,
	normalizeRecurrence,
	recurrenceToday,
	type StoredRecurrence,
} from "~/modules/recurring/application/recurrences";
import { createEventEnvelope } from "~/shared/application/events";
import { PostgresOutbox } from "~/shared/infra/outbox";
import { closeDatabase, queryRaw, withRawTransaction } from "~/shared/infra/sql";
import {
	missingRecurrenceDates,
	parseReplayMissingRecurrencesOptions,
	resolveOccupiedRecurrenceDates,
} from "./replay-missing-recurrences-options";

const help = `Recompõe somente ocorrências ausentes, diretamente no banco, sem RabbitMQ.

Uso: bun run schedule:repair --from YYYY-MM-DD [--through YYYY-MM-DD]
  [--recurrence-id ID] [--user-id ID] [--name "Nome exato"]
  [--include-inactive] [--apply]

Sem --apply: simulação, nenhuma gravação. Data final padrão: hoje.
Recorrências pausadas são ignoradas salvo --include-inactive.
Usa configuração atual, preserva cursor, lançamentos e exclusões manuais.`;

async function occupiedDates(recurrence: StoredRecurrence) {
	// Markers include manual deletions. Also protect legacy concrete records without a marker.
	const rows = await queryRaw<{ date: Date | string | null }>(
		`SELECT "date" FROM "RecurrenceOccurrence" WHERE "recurrenceId"=$1
		UNION SELECT COALESCE("recurrenceOccurrenceDate", "date")::date FROM "Transaction" WHERE "recurrenceId"=$1
		UNION SELECT COALESCE("recurrenceOccurrenceDate", "purchaseDate")::date FROM "CreditPurchaseRecord" WHERE "recurrenceId"=$1`,
		[recurrence.id],
	);
	return rows.map(row => (row.date ? recurrenceDateKey(row.date) : null));
}

async function main() {
	const args = process.argv.slice(2);
	if (args.includes("--help")) {
		console.log(help);
		return;
	}
	const options = parseReplayMissingRecurrencesOptions(args, recurrenceToday());
	if (options.apply) {
		const [integrity] = await queryRaw<{ definition: string }>(
			`SELECT pg_get_functiondef(oid) AS "definition" FROM pg_proc WHERE oid=to_regprocedure('public.enforce_credit_purchase_integrity()')`,
		);
		if (!integrity || /"Subscription"|subscriptionId|subscriptionOccurrenceDate/.test(integrity.definition))
			throw new Error(
				"Validação de compras ausente ou com referências antigas. Execute bun run schedule:repair-integrity --apply antes do reparo. Se a função estiver ausente, restaure as constraints do livro de crédito. Nenhuma recorrência foi gravada nesta execução.",
			);
	}
	const conditions: string[] = [];
	const parameters: unknown[] = [];
	if (!options.includeInactive) conditions.push('"isActive"=true');
	for (const [field, value] of [
		["id", options.recurrenceId],
		["userId", options.userId],
		["name", options.name],
	] as const) {
		if (value) {
			parameters.push(value);
			conditions.push(`"${field}"=$${parameters.length}`);
		}
	}
	const rows = await queryRaw(
		`SELECT * FROM "Recurrence"${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY "userId","name","id"`,
		parameters,
	);
	console.log(
		`${options.apply ? "Gravação" : "Simulação"}: ${options.from} até ${options.through}. ${rows.length} recorrência(s).`,
	);
	let total = 0;
	let blocked = 0;
	for (const row of rows) {
		const selected = normalizeRecurrence(row);
		const processRecurrence = async () => {
			// Recheck schedule and identities under the same lock used by the worker.
			const recurrence = options.apply
				? await getStoredRecurrence(selected.userId, selected.id, true)
				: selected;
			if (recurrenceNeedsConfiguration(recurrence)) {
				console.log(`${recurrence.id} | ${recurrence.name} | ignorada: configuração incompleta`);
				return 0;
			}
			const identities = resolveOccupiedRecurrenceDates(recurrence, await occupiedDates(recurrence), options);
			if (identities.unresolved.length > 0) {
				blocked++;
				console.error(
					`${recurrence.id} | ${recurrence.name} | reparo bloqueado: vínculos sem identidade inequívoca (${identities.unresolved.join(", ")}). Revise associações antes de recompor.`,
				);
				return 0;
			}
			const dates = missingRecurrenceDates(recurrence, identities.occupied, options);
			if (dates.length === 0) return 0;
			console.log(
				`${recurrence.id} | usuário ${recurrence.userId} | ${recurrence.name} | ${recurrence.movement} | ${recurrence.amount} | ausentes: ${dates.join(", ")}`,
			);
			if (!options.apply) return dates.length;
			let created = 0;
			for (const date of dates)
				created += await materializeRecurrence(recurrence.userId, recurrence.id, options.through, {
					from: date,
					through: date,
				});
			if (created > 0)
				await new PostgresOutbox().append(
					createEventEnvelope({
						aggregateId: recurrence.id,
						aggregateType: "schedule",
						correlationId: crypto.randomUUID(),
						eventType: "materialized",
						payload: { created, from: options.from, through: options.through },
						userIds: [recurrence.userId],
					}),
				);
			return created;
		};
		total += options.apply ? await withRawTransaction(processRecurrence) : await processRecurrence();
	}
	console.log(
		`${total} ocorrência(s) ${options.apply ? "criada(s)" : "ausente(s)"}.${options.apply ? "" : " Repita com --apply para gravar."}`,
	);
	if (blocked > 0) {
		console.error(
			`${blocked} recorrência(s) bloqueada(s), sem recomposição. Demais recorrências foram processadas.`,
		);
		process.exitCode = 1;
	}
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	await closeDatabase();
}
