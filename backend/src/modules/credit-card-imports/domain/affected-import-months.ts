/** Each installment occupies one statement month, anchored by the approved installment. */
export function affectedImportMonths(
	statementDate: Date | string,
	purchases: Array<{ currentInstallment: number; installments: number }>,
) {
	const date = new Date(statementDate);
	const months = new Set<string>();
	for (const purchase of purchases) {
		for (let installment = 1; installment <= purchase.installments; installment++) {
			months.add(
				new Date(
					Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + installment - purchase.currentInstallment, 1),
				)
					.toISOString()
					.slice(0, 7),
			);
		}
	}
	return [...months].sort();
}
