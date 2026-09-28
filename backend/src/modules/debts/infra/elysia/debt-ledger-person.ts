export function normalizeDebtLedgerPerson<
	Person extends { balance: number | string; connectionStatus: null | string },
>(person: Person) {
	return {
		...person,
		balance: Number(person.balance),
		isZaimuUser: person.connectionStatus === "ACCEPTED",
	};
}
