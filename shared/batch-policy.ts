/** Explicit registration of independent list actions. Form submissions stay immediate. */
const routes: ReadonlyArray<readonly [string, RegExp]> = [
	["POST", /^\/(credit-card-imports|transaction-imports)\/[^/]+\/items\/[^/]+\/approve$/],
	["POST", /^\/transaction-imports\/[^/]+\/days\/[^/]+\/approve$/],
	["POST", /^\/transaction-imports\/[^/]+\/items\/[^/]+\/transfer-suggestions\/[^/]+\/(accept|reject)$/],
	["POST", /^\/transactions\/[^/]+\/transfer-suggestions\/[^/]+\/(accept|reject)$/],
	[
		"DELETE",
		/^\/(categories|financial-accounts|financial-account-yields|financial-account-yield-holidays|balance-adjustments|financial-institutions|transactions|recurring|monthly-budgets)\/[^/]+$/,
	],
	["DELETE", /^\/credit-cards\/[^/]+\/purchases\/[^/]+(?:\/refunds\/[^/]+)?$/],
	["POST", /^\/financial-institutions\/notifications\/[^/]+\/read$/],
	["POST", /^\/debts\/invitations\/[^/]+\/decline$/],
	["DELETE", /^\/admin\/yield-calendar\/holidays\/[^/]+$/],
	["DELETE", /^\/debts\/(events|people)\/[^/]+$/],
];

export const BATCH_MAX_ACTIONS = 50;
export const BATCH_MAX_BYTES = 1024 * 1024;
export const BATCH_DEBOUNCE_MS = 300;
export const BATCH_MAX_WAIT_MS = 1000;

export function isBatchAction(method: string, path: string): boolean {
	// Canonical local paths only. Encoded separators/dot segments must never change dispatch.
	if (!/^\/[a-zA-Z0-9/_-]+$/.test(path) || path.includes("//")) return false;
	return routes.some(([registeredMethod, pattern]) => registeredMethod === method && pattern.test(path));
}

/** Compare records, reserving import-wide locks for bulk/day actions. */
export function batchActionsOverlap(leftPath: string, rightPath: string): boolean {
	const left = new URL(leftPath, "http://localhost").pathname.split("/").filter(Boolean);
	const right = new URL(rightPath, "http://localhost").pathname.split("/").filter(Boolean);
	if (!left[1] || left[0] !== right[0] || left[1] !== right[1]) return false;
	if (left[0] === "credit-card-imports" || left[0] === "transaction-imports") {
		if (left[2] === "items" && right[2] === "items") return left[3] === right[3];
		return true;
	}
	if (left[0] === "debts") return left[2] === right[2];
	return true;
}
