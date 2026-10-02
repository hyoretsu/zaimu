import { loanInstallments } from "@zaimu/finance/loan";
import type { Loan, LoanPayment } from "../api";
import { requestResult, transactionDone } from "../idb";
import { initLocalDb, type LocalData, type StorageOwner } from "../localStorage";
import { getCurrentCacheIdentity } from "../query-cache";

const scopedId = (owner: StorageOwner, id: string) => `${owner}\u0000${id}`;
function requireOwner(value?: StorageOwner) {
	const owner = value ?? getCurrentCacheIdentity();
	if (!owner) throw new Error("Identidade local indisponível");
	return owner;
}
function validateLoanPaidDate(value: string) {
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		!Number.isFinite(Date.parse(value)) ||
		new Date(value).toISOString().slice(0, 10) !== value
	)
		throw new Error("Data inválida");
}
export async function reviewLocalLoanPayments(
	loanId: string,
	paidDate: string,
	amortization: Loan["amortization"],
	ownerKey?: StorageOwner,
) {
	validateLoanPaidDate(paidDate);
	const owner = requireOwner(ownerKey);
	const database = await initLocalDb();
	const tx = database.transaction(["scoped-loans", "scoped-loanPayments"], "readwrite");
	const done = transactionDone(tx);
	try {
		const loans = tx.objectStore("scoped-loans");
		const record = (await requestResult(loans.get(scopedId(owner, loanId)))) as LocalData<Loan> | undefined;
		if (!record || record.deleted || !record.data.needsPaymentReview) throw new Error("Revisão indisponível");
		const count = record.data.paidInstallments ?? 0;
		if (!Number.isSafeInteger(count) || count < 0 || count > record.data.totalInstallments)
			throw new Error("Quantidade histórica inválida");
		const store = tx.objectStore("scoped-loanPayments");
		let rows = (
			(await requestResult(store.index("ownerKey").getAll(owner))) as LocalData<LoanPayment>[]
		).filter(row => !row.deleted && row.data.loanId === loanId);
		const terms = { ...record.data, amortization };
		if (!rows.length)
			rows = loanInstallments(terms).map(payment => {
				const id = crypto.randomUUID();
				return {
					data: { ...payment, id, isAdvanced: false, loanId },
					localId: id,
					modifiedAt: record.modifiedAt,
					ownerKey: owner,
					scopedId: scopedId(owner, id),
				};
			});
		if (record.data.amortization !== amortization && rows.length) {
			const schedule = loanInstallments(terms);
			rows = rows.map(row => ({
				...row,
				data: { ...row.data, ...schedule[row.data.installmentNumber - 1] },
			}));
		}
		if (rows.length !== terms.totalInstallments || rows.some(row => row.data.paidDate))
			throw new Error("Histórico inconsistente para revisão");
		for (const row of rows)
			store.put({
				...row,
				data: {
					...row.data,
					isAdvanced: false,
					paidDate: row.data.installmentNumber <= count ? paidDate : undefined,
				},
				modifiedAt: Math.max(Date.now(), row.modifiedAt + 1),
			});
		loans.put({
			...record,
			data: { ...terms, installmentAmount: rows[0].data.totalPaid, needsPaymentReview: false },
			modifiedAt: Math.max(Date.now(), record.modifiedAt + 1),
		});
		await done;
	} catch (error) {
		tx.abort();
		await done.catch(() => undefined);
		throw error;
	}
}
