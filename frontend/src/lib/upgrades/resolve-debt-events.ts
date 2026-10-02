import type { DebtSplit, StoredDebtEvent } from "../api";
import { requestResult, transactionDone } from "../idb";
import type { LocalData, StorageOwner } from "../localStorage";
import type { Debt } from "./legacy-contracts";

interface Proof {
	id: string;
	ownerKey: StorageOwner;
	original: Debt;
	originId: string;
	debtPersonId: string;
	settlementId: string | null;
	resolved?: boolean;
}
interface Resolution {
	originId: string;
	debtPersonId: string;
	settlementId: string | null;
	deleted: boolean;
}
export async function resolveDebtEventUpgrade(
	database: IDBDatabase,
	owner: StorageOwner,
	register: (
		records: Pick<Proof, "original" | "originId" | "debtPersonId" | "settlementId">[],
	) => Promise<Resolution[]>,
) {
	const pending = (
		(await requestResult(
			database.transaction("application-upgrade", "readonly").objectStore("application-upgrade").getAll(),
		)) as Proof[]
	).filter(row => row.id.startsWith("debt-proof:") && row.ownerKey === owner && !row.resolved);
	if (!pending.length) return;
	const results: Resolution[] = [];
	for (let index = 0; index < pending.length; index += 1000)
		results.push(
			...(await register(
				pending.slice(index, index + 1000).map(({ original, originId, debtPersonId, settlementId }) => ({
					debtPersonId,
					original,
					originId,
					settlementId,
				})),
			)),
		);
	const tx = database.transaction(
		[
			"application-upgrade",
			"scoped-debtEvents",
			"scoped-debtPeople",
			"scoped-transactions",
			"scoped-creditBooks",
			"scoped-recurrences",
		],
		"readwrite",
	);
	const done = transactionDone(tx);
	try {
		const events = tx.objectStore("scoped-debtEvents");
		const people = tx.objectStore("scoped-debtPeople");
		const key = (id: string) => `${owner}\u0000${id}`;
		const peopleMap = new Map<string, string>();
		for (const proof of pending) {
			const result = results.find(row => row.originId === proof.originId);
			if (!result) throw new Error("Upgrade da dívida não resolvido");
			if (proof.debtPersonId !== result.debtPersonId) peopleMap.set(proof.debtPersonId, result.debtPersonId);
			const origin = (await requestResult(events.get(key(proof.originId)))) as
				| LocalData<StoredDebtEvent>
				| undefined;
			if (origin && result.deleted) await requestResult(events.put({ ...origin, deleted: true }));
			if (proof.settlementId && result.settlementId) {
				const row = (await requestResult(events.get(key(proof.settlementId)))) as
					| LocalData<StoredDebtEvent>
					| undefined;
				if (row) {
					const destination = await requestResult(events.get(key(result.settlementId)));
					if (destination && row.localId !== destination.localId)
						throw new Error("Colisão de compensação exige revisão");
					await requestResult(events.delete(row.scopedId));
					await requestResult(
						events.put({
							...row,
							data: { ...row.data, id: result.settlementId, upgradeRecordId: result.settlementId },
							localId: result.settlementId,
							scopedId: key(result.settlementId),
						}),
					);
				}
			}
			await requestResult(tx.objectStore("application-upgrade").put({ ...proof, resolved: true }));
		}
		for (const [oldId, newId] of peopleMap) {
			const old = await requestResult(people.get(key(oldId)));
			if (old && !(await requestResult(people.get(key(newId)))))
				await requestResult(
					people.put({ ...old, data: { ...old.data, id: newId }, localId: newId, scopedId: key(newId) }),
				);
			await requestResult(people.delete(key(oldId)));
		}
		const split = (value: DebtSplit | null | undefined) =>
			value
				? {
						...value,
						participants: value.participants.map(p => ({
							...p,
							debtPersonId: peopleMap.get(p.debtPersonId) ?? p.debtPersonId,
						})),
						...("remainderDebtPersonId" in value && value.remainderDebtPersonId
							? {
									remainderDebtPersonId:
										peopleMap.get(value.remainderDebtPersonId) ?? value.remainderDebtPersonId,
								}
							: {}),
					}
				: value;
		for (const name of [
			"scoped-debtEvents",
			"scoped-transactions",
			"scoped-creditBooks",
			"scoped-recurrences",
		]) {
			const store = tx.objectStore(name);
			for (const row of await requestResult(store.index("ownerKey").getAll(owner))) {
				const data =
					name === "scoped-debtEvents"
						? { ...row.data, debtPersonId: peopleMap.get(row.data.debtPersonId) ?? row.data.debtPersonId }
						: name === "scoped-creditBooks"
							? {
									...row.data,
									purchases: row.data.purchases.map(
										(p: import("@zaimu/finance/credit-book").CreditBook["purchases"][number]) => ({
											...p,
											debtSplitRule: split(p.debtSplitRule as DebtSplit | null),
										}),
									),
								}
							: { ...row.data, debtSplit: split(row.data.debtSplit) };
				await requestResult(store.put({ ...row, data }));
			}
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
