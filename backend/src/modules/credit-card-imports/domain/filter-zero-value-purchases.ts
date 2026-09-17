export function filterZeroValuePurchases<T extends { installmentAmount: number; totalAmount: number }>(
	purchases: T[],
) {
	return purchases.filter(purchase => purchase.installmentAmount !== 0 && purchase.totalAmount !== 0);
}
