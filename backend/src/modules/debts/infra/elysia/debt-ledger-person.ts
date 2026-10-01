export function normalizeDebtLedgerPerson<
	Person extends { balance: number | string; connectionStatus: null | string },
>(person: Person): Omit<Person, "balance"> & { balance: number; isZaimuUser: boolean } {
	return {
		...person,
		balance: Number(person.balance),
		isZaimuUser: person.connectionStatus === "ACCEPTED",
	};
}
