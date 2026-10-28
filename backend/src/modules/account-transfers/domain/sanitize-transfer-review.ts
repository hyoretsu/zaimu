/** Import reviews may embed IDs inside JSON. Never carry private cross-owner links. */
export function sanitizeTransferReview(
	value: unknown,
	privateIds: Set<string>,
	retainedIds: Set<string>,
	categoryIds: Map<string, string>,
	senderId: string,
	recipientId: string,
	key = "",
): unknown {
	if (/^(debtSplit|debtPerson|connection|credential)/i.test(key)) return null;
	if (Array.isArray(value))
		return value
			.map(item =>
				sanitizeTransferReview(
					item,
					privateIds,
					retainedIds,
					categoryIds,
					senderId,
					recipientId,
					key,
				),
			)
			.filter(item => item !== null);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([field, item]) => [
				field,
				sanitizeTransferReview(
					item,
					privateIds,
					retainedIds,
					categoryIds,
					senderId,
					recipientId,
					field,
				),
			]),
		);
	if (typeof value !== "string" || !/(?:Id|Ids)$/.test(key) || /^external/i.test(key)) return value;
	if (key === "userId" && value === senderId) return recipientId;
	if (categoryIds.has(value)) return categoryIds.get(value);
	return privateIds.has(value) && !retainedIds.has(value) ? null : value;
}
