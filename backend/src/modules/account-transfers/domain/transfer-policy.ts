import { createHash } from "node:crypto";

export function transferVersion(snapshot: unknown) {
	return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function availableTransferName(name: string | null, occupied: Set<string>) {
	const base = name?.trim() || "Conta";
	let candidate = base;
	for (let suffix = 2; occupied.has(candidate); suffix++) {
		const tail = ` (${suffix})`;
		candidate = `${base.slice(0, 70 - tail.length)}${tail}`;
	}
	occupied.add(candidate);
	return candidate;
}

export function recurrenceMoves(references: Array<string | null>, selected: Set<string>) {
	const ids = references.filter((id): id is string => id !== null);
	return ids.length > 0 && ids.every(id => selected.has(id));
}
