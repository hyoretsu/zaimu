import {
	addBookRefund,
	type CreditBook,
	removeBookRefund,
	updateBookRefund,
} from "@zaimu/finance/credit-book";
import { HttpException } from "~/shared/errors";
import { withRawTransaction } from "~/shared/infra/sql";
import { mutateCreditBook } from "./normalized-credit-book";

/** Incoming normalized records are merged inside the same card lock as HTTP mutations. */
export async function syncCreditBook(userId: string, input: CreditBook) {
	await withRawTransaction(async query => {
		const recurring = input.purchases
			.filter(p => p.subscriptionId && p.subscriptionOccurrenceDate)
			.toSorted((a, b) => a.subscriptionId!.localeCompare(b.subscriptionId!));
		for (const purchase of recurring) {
			const [owner] = await query('SELECT "id" FROM "Recurrence" WHERE "id"=$1 AND "userId"=$2 FOR UPDATE', [
				purchase.subscriptionId,
				userId,
			]);
			if (!owner) throw new HttpException("Recorrência da compra indisponível", 400);
			const [identity] = await query(
				'SELECT * FROM "RecurrenceOccurrence" WHERE "recurrenceId"=$1 AND "date"=$2',
				[purchase.subscriptionId, purchase.subscriptionOccurrenceDate],
			);
			if (identity && (identity.deletedAt || identity.purchaseId !== purchase.id))
				throw new HttpException(
					"Ocorrência já processada; atualize dados do cartão antes de sincronizar",
					409,
				);
		}
		await mutateCreditBook(userId, input.card.id, book => {
			book.deletedPurchaseIds = [
				...new Set([...(book.deletedPurchaseIds ?? []), ...(input.deletedPurchaseIds ?? [])]),
			];
			book.deletedChargeIds = [
				...new Set([...(book.deletedChargeIds ?? []), ...(input.deletedChargeIds ?? [])]),
			];
			for (const id of input.deletedPurchaseIds ?? []) {
				if (input.purchases.some(p => p.id === id))
					throw new HttpException("Compra excluída também enviada no sync", 400);
				if (!book.purchases.some(p => p.id === id)) continue;
				book.purchases = book.purchases.filter(p => p.id !== id);
				book.installments = book.installments.filter(i => i.purchaseId !== id);
				book.refunds = book.refunds.filter(r => r.purchaseId !== id);
			}
			for (const id of input.deletedChargeIds ?? []) {
				if (input.charges.some(ch => ch.id === id))
					throw new HttpException("Encargo excluído também enviado no sync", 400);
				book.charges = book.charges.filter(ch => ch.id !== id);
			}
			const statements = new Map(book.statements.map(s => [s.id, s]));
			for (const s of input.statements) {
				if (s.creditCardId !== book.card.id || s.isForecast)
					throw new HttpException("Fatura do sync inválida", 400);
				if (!statements.has(s.id)) {
					book.statements.push({ ...s, isPaid: false, paidAmount: 0, totalAmount: 0 });
					statements.set(s.id, s);
				}
			}
			for (const p of input.purchases) {
				if (book.deletedPurchaseIds?.includes(p.id))
					throw new HttpException("Compra excluída não pode ser restaurada pelo sync", 409);
				if (p.creditCardId !== book.card.id) throw new HttpException("Compra vinculada a outro cartão", 400);
				const existing = book.purchases.find(old => old.id === p.id);
				if (existing && existing.updatedAt > p.updatedAt)
					throw new HttpException("Compra alterada no servidor; atualize antes de sincronizar", 409);
				const next = { ...p, creditCardId: book.card.id, userId };
				if (existing) Object.assign(existing, next);
				else book.purchases.push(next);
			}
			for (const i of input.installments) {
				if (!book.purchases.some(p => p.id === i.purchaseId) || !statements.has(i.statementId))
					throw new HttpException("Vínculo de parcela inválido", 400);
				const existing = book.installments.find(old => old.id === i.id);
				if (existing && existing.purchaseId !== i.purchaseId)
					throw new HttpException("Identidade da parcela imutável", 409);
				if (existing) Object.assign(existing, i);
				else book.installments.push(i);
			}
			for (const r of input.refunds.toSorted(
				(a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
			)) {
				const existing = book.refunds.find(old => old.id === r.id);
				if (existing) {
					if (existing.purchaseId !== r.purchaseId || existing.policy !== r.policy)
						throw new HttpException("Vínculo e política do reembolso imutáveis", 409);
					if (existing.updatedAt > r.updatedAt)
						throw new HttpException("Reembolso alterado no servidor", 409);
					if (r.deletedAt) {
						if (!existing.deletedAt) removeBookRefund(book, r.purchaseId, r.id, r.updatedAt);
					} else if (existing.deletedAt)
						throw new HttpException("Reembolso excluído não pode ser restaurado pelo sync", 409);
					else
						updateBookRefund(
							book,
							r.purchaseId,
							r.id,
							{ amount: r.amountCents / 100, creditDate: r.creditDate },
							r.updatedAt,
						);
					existing.externalId = r.externalId ?? existing.externalId;
					existing.time = r.time ?? existing.time;
				} else {
					if (r.deletedAt) {
						book.refunds.push({ ...r, cancellationEligible: false });
						continue;
					}
					const created = addBookRefund(
						book,
						r.purchaseId,
						{ amount: r.amountCents / 100, creditDate: r.creditDate, id: r.id, policy: r.policy },
						r.createdAt,
					);
					// Migrated history may only narrow cancellation eligibility.
					created.cancellationEligible = created.cancellationEligible && r.cancellationEligible;
					created.updatedAt = r.updatedAt;
					created.externalId = r.externalId ?? null;
					created.time = r.time ?? null;
				}
			}
			for (const ch of input.charges) {
				if (!statements.has(ch.statementId)) throw new HttpException("Fatura do encargo inválida", 400);
				const existing = book.charges.find(old => old.id === ch.id);
				if (existing) Object.assign(existing, ch);
				else book.charges.push(ch);
			}
		});
		for (const purchase of recurring)
			await query(
				'INSERT INTO "RecurrenceOccurrence" ("recurrenceId","date","purchaseId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
				[purchase.subscriptionId, purchase.subscriptionOccurrenceDate, purchase.id],
			);
	});
}
