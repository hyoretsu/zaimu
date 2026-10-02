import type { CreditBook } from "@zaimu/finance/credit-book";
import type { Transaction } from "../api";
import { requestResult, transactionDone } from "../idb";
import type { LocalData, StorageOwner } from "../localStorage";
import type { Recurrence, RecurrenceOccurrence } from "../recurrence";

interface Mapping {
	id: string;
	ownerKey: StorageOwner;
	source: string;
	legacyId: string;
	recurrenceId: string;
	resolved?: boolean;
}
interface Resolution {
	source: string;
	legacyId: string;
	recurrenceId: string;
	deleted: boolean;
}
/** Resolve server identities before normal sync; network never runs inside an IDB transaction. */
export async function resolveUpgradeRecurrenceIds(
	database: IDBDatabase,
	owner: StorageOwner,
	lookup: (ids: Array<{ source: string; legacyId: string }>) => Promise<Resolution[]>,
) {
	const reading = database.transaction("application-upgrade", "readonly");
	const pending = (
		(await requestResult(reading.objectStore("application-upgrade").getAll())) as Mapping[]
	).filter(row => row.ownerKey === owner && row.source && !row.resolved);
	if (!pending.length) return;
	const results: Resolution[] = [];
	for (let index = 0; index < pending.length; index += 1000)
		results.push(
			...(await lookup(
				pending.slice(index, index + 1000).map(({ source, legacyId }) => ({ legacyId, source })),
			)),
		);
	const tx = database.transaction(
		[
			"application-upgrade",
			"scoped-recurrences",
			"scoped-recurrenceOccurrences",
			"scoped-transactions",
			"scoped-creditBooks",
		],
		"readwrite",
	);
	const done = transactionDone(tx);
	try {
		const map = new Map<string, Resolution>();
		for (const mapping of pending) {
			const current = await requestResult(tx.objectStore("application-upgrade").get(mapping.id));
			if (current?.resolved) continue;
			const result = results.find(row => row.source === mapping.source && row.legacyId === mapping.legacyId);
			if (result) map.set(mapping.recurrenceId, result);
			await requestResult(
				tx
					.objectStore("application-upgrade")
					.put({ ...current, recurrenceId: result?.recurrenceId ?? mapping.recurrenceId, resolved: true }),
			);
		}
		const scopedId = (id: string) => `${owner}\u0000${id}`;
		const recurrences = tx.objectStore("scoped-recurrences");
		for (const row of (await requestResult(
			recurrences.index("ownerKey").getAll(owner),
		)) as LocalData<Recurrence>[]) {
			const target = map.get(row.data.id);
			if (!target) continue;
			const destination = (await requestResult(recurrences.get(scopedId(target.recurrenceId)))) as
				| LocalData<Recurrence>
				| undefined;
			if (destination && destination.localId !== row.localId)
				throw new Error("Colisão de recorrência exige revisão explícita");
			await requestResult(recurrences.delete(row.scopedId));
			await requestResult(
				recurrences.put({
					...row,
					data: { ...row.data, id: target.recurrenceId },
					deleted: row.deleted || target.deleted,
					localId: target.recurrenceId,
					scopedId: scopedId(target.recurrenceId),
				}),
			);
		}
		const occurrences = tx.objectStore("scoped-recurrenceOccurrences");
		for (const row of (await requestResult(
			occurrences.index("ownerKey").getAll(owner),
		)) as LocalData<RecurrenceOccurrence>[]) {
			const target = map.get(row.data.recurrenceId);
			if (!target) continue;
			await requestResult(occurrences.delete(row.scopedId));
			if (target.deleted) {
				await requestResult(
					tx
						.objectStore("application-upgrade")
						.put({ id: `deleted-occurrence:${row.scopedId}`, original: row }),
				);
				continue;
			}
			const id = `${target.recurrenceId}:${row.data.date}`;
			await requestResult(
				occurrences.put({
					...row,
					data: { ...row.data, id, recurrenceId: target.recurrenceId },
					localId: id,
					scopedId: scopedId(id),
				}),
			);
		}
		const transactions = tx.objectStore("scoped-transactions");
		for (const row of (await requestResult(
			transactions.index("ownerKey").getAll(owner),
		)) as LocalData<Transaction>[]) {
			const target = row.data.recurrenceId && map.get(row.data.recurrenceId);
			if (!target) continue;
			await requestResult(
				transactions.put({
					...row,
					data: { ...row.data, recurrenceId: target.deleted ? undefined : target.recurrenceId },
				}),
			);
		}
		const books = tx.objectStore("scoped-creditBooks");
		for (const row of (await requestResult(
			books.index("ownerKey").getAll(owner),
		)) as LocalData<CreditBook>[]) {
			const purchases = row.data.purchases.map(p => {
				const target = p.recurrenceId && map.get(p.recurrenceId);
				return target ? { ...p, recurrenceId: target.deleted ? null : target.recurrenceId } : p;
			});
			await requestResult(books.put({ ...row, data: { ...row.data, purchases } }));
		}
		await done;
	} catch (error) {
		try {
			tx.abort();
		} catch {}
		await done.catch(() => undefined);
		throw error;
	}
}
