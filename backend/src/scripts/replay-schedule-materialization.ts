import { publishScheduleMaterialization } from "~/shared/application/schedule-materialization-command";
import { RabbitMqBroker } from "~/shared/infra/broker";

function parseCutoff(value: string | undefined) {
	if (!value) return new Date();
	const cutoff = new Date(value);
	if (Number.isNaN(cutoff.getTime()))
		throw new Error(`Data inválida: ${value}. Use uma data ISO, por exemplo 2026-09-28T23:59:00-03:00.`);
	return cutoff;
}

const cutoff = parseCutoff(process.argv[2]);
const broker = new RabbitMqBroker();

try {
	await publishScheduleMaterialization(broker, cutoff, { force: true });
	console.log(
		`Reprocessamento publicado até ${cutoff.toISOString()}. Mantenha o worker ativo para materializar ocorrências faltantes.`,
	);
} finally {
	await broker.close();
}
