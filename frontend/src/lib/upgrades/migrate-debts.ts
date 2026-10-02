import type { DebtPerson, StoredDebtEvent } from "../api";
import { requestResult } from "../idb";
import type { LocalData } from "../localStorage";
import type { Debt } from "./legacy-contracts";

const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
// Stable namespace for historical compensation; collision is reviewed, never overwritten.
export const settlementId = (id: string) => `${id[0] === "0" ? "1" : "0"}${id.slice(1)}`;
export async function migrateDebts(tx: IDBTransaction) {
	const peopleStore = tx.objectStore("scoped-debtPeople");
	const events = tx.objectStore("scoped-debtEvents");
	const people = (await requestResult(peopleStore.getAll())) as LocalData<DebtPerson>[];
	const debts = (await requestResult(tx.objectStore("scoped-debts").getAll())) as LocalData<Debt>[];
	for (const row of debts) {
		const debt = row.data;
		const candidates = people.filter(
			person =>
				person.ownerKey === row.ownerKey &&
				!person.deleted &&
				(debt.personId
					? person.data.id === debt.personId
					: normalizeName(person.data.name) === normalizeName(debt.personName)),
		);
		if (candidates.length > 1 || (debt.personId && !candidates.length))
			throw new Error("Pessoa ambígua na dívida antiga; revisão necessária");
		let person = candidates[0];
		if (!person) {
			const id = debt.id;
			if (id.length > 36) throw new Error("Pessoa antiga exige atribuição explícita");
			person = {
				...row,
				data: {
					accountEmail: null,
					balance: 0,
					connectionStatus: null,
					events: [],
					id,
					isZaimuUser: false,
					name: debt.personName.trim().replace(/\s+/g, " "),
				},
				localId: id,
				scopedId: `${row.ownerKey}\u0000${id}`,
			};
			await requestResult(peopleStore.put(person));
			people.push(person);
		}
		const now = new Date(row.modifiedAt).toISOString();
		const origin: StoredDebtEvent = {
			amount: debt.amount,
			createdAt: now,
			date: debt.date ?? null,
			debtPersonId: person.data.id,
			description: debt.description,
			dueDate: debt.dueDate,
			effect: debt.amount * (debt.isOwedToMe ? 1 : -1),
			id: debt.id,
			kind: "ORIGIN",
			updatedAt: now,
		};
		const converted = [origin];
		if (debt.isPaid)
			converted.push({
				...origin,
				date: debt.paidDate ?? debt.date ?? null,
				description: "Quitação migrada",
				effect: -origin.effect,
				id: settlementId(debt.id),
				kind: "MIGRATED_SETTLEMENT",
				upgradeRecordId: settlementId(debt.id),
			});
		for (const data of converted) {
			const key = `${row.ownerKey}\u0000${data.id}`;
			const existing = await requestResult(events.get(key));
			if (existing && JSON.stringify(existing.data) !== JSON.stringify(data))
				throw new Error("Colisão de evento antigo exige revisão");
			if (!existing) await requestResult(events.put({ ...row, data, localId: data.id, scopedId: key }));
		}
		await requestResult(
			tx
				.objectStore("application-upgrade")
				.put({
					debtPersonId: person.data.id,
					id: `debt-proof:${row.scopedId}`,
					original: debt,
					originId: debt.id,
					ownerKey: row.ownerKey,
					settlementId: debt.isPaid ? settlementId(debt.id) : null,
				}),
		);
	}
	await requestResult(tx.objectStore("scoped-debts").clear());
}
