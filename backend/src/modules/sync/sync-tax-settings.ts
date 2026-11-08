export function syncTaxSettings(
	incoming: { yieldTaxIds?: string[] | null; yieldTaxModes?: Record<string, string> | null },
	existing?: { yieldTaxIds?: string[] | null; yieldTaxModes?: Record<string, string> | null },
) {
	return {
		yieldTaxIds:
			incoming.yieldTaxIds === undefined ? (existing?.yieldTaxIds ?? []) : (incoming.yieldTaxIds ?? []),
		yieldTaxModes:
			incoming.yieldTaxModes === undefined ? (existing?.yieldTaxModes ?? null) : incoming.yieldTaxModes,
	};
}
