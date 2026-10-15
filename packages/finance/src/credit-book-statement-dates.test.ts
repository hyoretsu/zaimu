import { expect, test } from "bun:test";
import {
	type CreditBook,
	ensureBookStatement,
	materializeBookInstallments,
	newBookPurchase,
	replayCreditBook,
	updateBookPurchaseDate,
	updateBookStatementDates,
} from "./credit-book";

function fixture(): CreditBook {
	const book: CreditBook = {
		card: {
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 20,
			userId: "owner",
			workingDueDate: true,
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	newBookPurchase(book, {
		description: "Compra",
		installments: 1,
		purchaseDate: "2026-08-10",
		totalAmount: 100,
	});
	materializeBookInstallments(book, "2026-08-30");
	return book;
}

test("editing statement dates preserves installment identity and explicit weekend due date", () => {
	const book = fixture();
	const statement = book.statements[0]!;
	const installment = structuredClone(book.installments[0]!);
	updateBookStatementDates(book, statement.id, { dueDate: "2026-08-29", statementDate: "2026-08-19" });
	materializeBookInstallments(book, "2026-08-30");
	expect(book.installments[0]).toEqual(installment);
	const replay = replayCreditBook(book, "2026-08-25");
	expect(replay.statements.find(item => item.id === statement.id)?.dueDate).toBe("2026-08-29");
	expect(replay.statements.find(item => item.id === statement.id)?.statementDate).toBe("2026-08-19");
});

test("statement edits reject invalid dates, missing records, reversed dates, and duplicate closing", () => {
	const book = fixture();
	const id = book.statements[0]!.id;
	expect(() =>
		updateBookStatementDates(book, id, { dueDate: "2026-03-10", statementDate: "2026-02-30" }),
	).toThrow("Data inválida");
	expect(() =>
		updateBookStatementDates(book, "missing", { dueDate: "2026-08-28", statementDate: "2026-08-20" }),
	).toThrow("Fatura não encontrada");
	expect(() =>
		updateBookStatementDates(book, id, { dueDate: "2026-08-19", statementDate: "2026-08-20" }),
	).toThrow("Vencimento");
	const other = ensureBookStatement(book, "2026-09-10");
	expect(() =>
		updateBookStatementDates(book, id, { dueDate: other.dueDate, statementDate: other.statementDate }),
	).toThrow("Já existe");
});

test("correcting January to December moves the December 3 purchase to December without duplicating it", () => {
	const book = fixture();
	book.purchases = [];
	book.installments = [];
	book.statements = [];
	book.card.statementDay = 4;
	book.card.dueDay = 10;
	newBookPurchase(book, {
		description: "Compra de dezembro",
		installments: 2,
		purchaseDate: "2026-12-03",
		totalAmount: 200,
	});
	materializeBookInstallments(book, "2027-02-01");
	const december = book.statements.find(item => item.statementDate === "2026-12-04")!;
	const january = book.statements.find(item => item.statementDate === "2027-01-04")!;
	book.statements = book.statements.filter(item => item.id !== december.id);
	book.installments[0]!.statementId = january.id;
	const ids = book.installments.map(item => item.id);
	updateBookStatementDates(book, january.id, { dueDate: "2026-12-10", statementDate: "2026-12-04" });
	expect(book.installments[0]!.statementId).toBe(january.id);
	expect(book.statements.find(item => item.id === book.installments[1]!.statementId)?.statementDate).toBe(
		"2027-01-04",
	);
	expect(book.installments.map(item => item.id)).toEqual(ids);
	expect(
		replayCreditBook(book, "2026-12-03").statements.find(item => item.id === january.id)?.totalAmount,
	).toBe(100);
});

test("earlier closing moves purchases after closing into the following cycle", () => {
	const book = fixture();
	const id = book.statements[0]!.id;
	updateBookStatementDates(book, id, { dueDate: "2026-08-28", statementDate: "2026-08-09" });
	expect(book.installments[0]!.statementId).not.toBe(id);
	expect(book.statements.find(item => item.id === book.installments[0]!.statementId)?.statementDate).toBe(
		"2026-09-20",
	);
});

test("later closing pulls purchases previously assigned to the next month", () => {
	const book = fixture();
	book.card.statementDay = 9;
	const original = book.statements[0]!;
	updateBookStatementDates(book, original.id, { dueDate: "2026-08-28", statementDate: "2026-08-09" });
	expect(book.installments[0]!.statementId).not.toBe(original.id);
	updateBookStatementDates(book, original.id, { dueDate: "2026-08-28", statementDate: "2026-08-11" });
	expect(book.installments[0]!.statementId).toBe(original.id);
});

test("December purchase starting in January keeps all twelve installments in consecutive due months", () => {
	const book = fixture();
	book.purchases = [];
	book.installments = [];
	book.statements = [];
	book.card.statementDay = 4;
	book.card.dueDay = 10;
	const purchase = newBookPurchase(book, {
		description: "Vivo Easy Lite",
		installments: 12,
		purchaseDate: "2025-12-03",
		totalAmount: 240,
	});
	materializeBookInstallments(book, "2027-01-01");
	const first = book.statements.find(item => item.statementDate === "2025-12-04")!;
	const ids = book.installments.filter(item => item.purchaseId === purchase.id).map(item => item.id);
	updateBookStatementDates(book, first.id, { dueDate: "2026-01-10", statementDate: "2025-12-04" });
	const months = book.installments
		.filter(item => item.purchaseId === purchase.id)
		.toSorted((a, b) => a.number - b.number)
		.map(item =>
			book.statements.find(statement => statement.id === item.statementId)!.dueDate.slice(0, 7),
		);
	expect(months).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`));
	expect(book.installments.filter(item => item.purchaseId === purchase.id).map(item => item.id)).toEqual(
		ids,
	);
	expect(new Set(book.installments.map(item => item.statementId)).size).toBe(12);
	updateBookPurchaseDate(book, purchase.id, purchase.purchaseDate);
	expect(new Set(book.installments.map(item => item.statementId)).size).toBe(12);
});

test("repair keeps the first registered January invoice when December never existed", () => {
	const book = fixture();
	book.purchases = [];
	book.installments = [];
	book.statements = [];
	book.card.statementDay = 4;
	book.card.dueDay = 11;
	const purchase = newBookPurchase(book, {
		description: "Vivo Easy Lite",
		installments: 12,
		purchaseDate: "2025-12-03",
		totalAmount: 240,
	});
	materializeBookInstallments(book, "2027-01-01");
	const december = book.statements.find(item => item.statementDate === "2025-12-04")!;
	const january = book.statements.find(item => item.statementDate === "2026-01-04")!;
	book.statements = book.statements.filter(item => item.id !== december.id);
	book.installments.find(item => item.number === 1)!.statementId = january.id;
	updateBookPurchaseDate(book, purchase.id, purchase.purchaseDate);
	expect(purchase.installmentStatementDates!.map(item => item!.dueDate.slice(0, 7))).toEqual(
		Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`),
	);
	expect(book.installments.find(item => item.number === 1)!.statementId).toBe(january.id);
});

test("an empty hidden December cycle does not pull a corrected January purchase backwards", () => {
	const book = fixture();
	book.purchases = [];
	book.installments = [];
	book.statements = [];
	book.card.statementDay = 4;
	book.card.dueDay = 11;
	const purchase = newBookPurchase(book, {
		description: "Vivo Easy Lite",
		installments: 12,
		purchaseDate: "2025-12-03",
		totalAmount: 240,
	});
	materializeBookInstallments(book, "2027-01-01");
	const january = book.statements.find(item => item.statementDate === "2026-01-04")!;
	book.installments.find(item => item.number === 1)!.statementId = january.id;
	updateBookPurchaseDate(book, purchase.id, purchase.purchaseDate);
	updateBookStatementDates(book, january.id, {
		dueDate: january.dueDate,
		statementDate: january.statementDate,
	});
	expect(book.installments.find(item => item.number === 1)!.statementId).toBe(january.id);
	expect(new Set(book.installments.map(item => item.statementId)).size).toBe(12);
});

test("imported closing reuses the registered cycle with the same due date", () => {
	const book = fixture();
	const original = book.statements[0]!;
	const imported = ensureBookStatement(book, "2026-08-10", {
		dueDate: original.dueDate,
		statementDate: original.dueDate,
	});
	expect(imported.id).toBe(original.id);
	expect(imported.statementDate).toBe("2026-08-20");
	expect(book.statements).toHaveLength(1);
});
