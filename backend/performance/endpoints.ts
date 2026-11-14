/**
 * Loopback endpoints of the dedicated performance stack. Defaults match the
 * original shared stack; a second isolated stack overrides ports/database through
 * environment variables (see README). Hosts are always 127.0.0.1.
 */
function port(name: string, fallback: number) {
	const raw = process.env[name];
	if (raw === undefined || raw === "") return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`${name}: invalid port`);
	return value;
}

const database = process.env.PERFORMANCE_DATABASE || "zaimu_performance";
if (!/^zaimu_performance[a-z0-9_]*$/.test(database))
	throw new Error("PERFORMANCE_DATABASE must match zaimu_performance[a-z0-9_]*");

export const PERFORMANCE_API_PORT = port("PERFORMANCE_API_PORT", 3335);
export const PERFORMANCE_DATABASE = database;
export const PERFORMANCE_POSTGRES_PORT = port("PERFORMANCE_POSTGRES_PORT", 55495);
export const PERFORMANCE_RABBITMQ_PORT = port("PERFORMANCE_RABBITMQ_PORT", 56795);
export const PERFORMANCE_REDIS_PORT = port("PERFORMANCE_REDIS_PORT", 6395);
export const PERFORMANCE_WEB_PORT = 5173;

export const PERFORMANCE_API_ORIGIN = `http://127.0.0.1:${PERFORMANCE_API_PORT}`;
export const PERFORMANCE_DATABASE_URL = `postgresql://performance:performance-local@127.0.0.1:${PERFORMANCE_POSTGRES_PORT}/${PERFORMANCE_DATABASE}`;
export const PERFORMANCE_RABBITMQ_URL = `amqp://performance:performance-local@127.0.0.1:${PERFORMANCE_RABBITMQ_PORT}`;
export const PERFORMANCE_REDIS_URL = `redis://127.0.0.1:${PERFORMANCE_REDIS_PORT}`;
