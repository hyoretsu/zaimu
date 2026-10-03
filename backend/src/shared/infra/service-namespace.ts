export function serviceNamespace() {
	return (
		process.env.SERVICE_NAMESPACE?.trim() || (process.env.NODE_ENV === "production" ? "zaimu" : "zaimu_dev")
	);
}

export function cacheKey(suffix: string) {
	return `${serviceNamespace()}:${suffix}`;
}

export function brokerExchange(exchange: string) {
	return exchange.replace(/^zaimu\./, `${serviceNamespace()}.`);
}

export function brokerQueue(queue: string) {
	const namespace = serviceNamespace();
	// Preserve existing production queues and their pending messages.
	return namespace === "zaimu" ? queue : `${namespace}:${queue}`;
}
