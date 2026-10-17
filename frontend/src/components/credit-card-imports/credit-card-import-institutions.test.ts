import { describe, expect, test } from "bun:test";
import {
	getCreditCardImportInstitution,
	getCreditCardImportProvider,
	getSelectableImportCards,
} from "./credit-card-import-institutions";

const accounts = [
	{ id: "nu-account", institution: { id: "nu", name: "Nubank" } },
	{ id: "inter-account", institution: { id: "inter", name: "Banco Inter" } },
	{ id: "other-account", institution: { id: "other", name: "Banco do Brasil" } },
	{ id: "nu-other-account", institution: { id: "nu-other", name: "Nubank" } },
];
const cards = accounts.map(account => ({ financialAccountId: account.id, id: `${account.id}-card` }));

describe("invoice institution selection", () => {
	test.each([
		["Bradesco", "BRADESCO"],
		["Inter", "INTER"],
		["Banco Inter", "INTER"],
		["Mercado Pago", "MERCADO_PAGO"],
		[" NUBANK ", "NUBANK"],
		["PicPay", "PICPAY"],
	] as const)("maps %s", (name, provider) => {
		expect(getCreditCardImportProvider({ id: "catalog", name })).toBe(provider);
	});
	test("rejects unsupported, partial and absent institutions", () => {
		for (const name of ["MeuPluggy", "Banco do Brasil", "Inter Empresas Desconhecido"]) {
			expect(getCreditCardImportProvider({ id: "other", name })).toBeUndefined();
		}
		expect(getCreditCardImportProvider(null)).toBeUndefined();
		expect(getCreditCardImportProvider()).toBeUndefined();
	});
	test("lists only supported cards before choosing an institution", () => {
		expect(getSelectableImportCards(cards, accounts)).toEqual([cards[0]!, cards[1]!, cards[3]!]);
		expect(getSelectableImportCards([{ financialAccountId: "missing" }], accounts)).toEqual([]);
	});
	test("filters Nubank by institutional ID, not provider or display name", () => {
		expect(getSelectableImportCards(cards, accounts, "nu")).toEqual([cards[0]!]);
	});
	test("card-first selection resolves its institution and importer", () => {
		const institution = getCreditCardImportInstitution(cards[1]!, accounts);
		expect(institution?.id).toBe("inter");
		expect(getCreditCardImportProvider(institution)).toBe("INTER");
	});
	test("changing institution invalidates the previous card", () => {
		const selected = cards[0]!;
		expect(
			getSelectableImportCards(cards, accounts, "inter").find(card => card.id === selected.id),
		).toBeUndefined();
	});
	test("single eligible card resolves its institution despite unsupported siblings", () => {
		const eligible = getSelectableImportCards([cards[0]!, cards[2]!], accounts);
		expect(eligible).toHaveLength(1);
		expect(getCreditCardImportInstitution(eligible[0]!, accounts)?.id).toBe("nu");
	});
});
