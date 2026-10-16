import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MoneyField } from "./MoneyField";

const renderField = (currencyCode: string, value = "") =>
	renderToStaticMarkup(
		<MoneyField
			currencyCode={currencyCode}
			id="credit-limit"
			label="Limite"
			onValueChange={() => undefined}
			rawValueName="creditLimit"
			value={value}
		/>,
	);

test("unconfigured institution currency keeps the money field mounted and disabled", () => {
	for (const currency of ["", " "]) {
		const html = renderField(currency, "1500");
		expect(html).toContain('disabled=""');
		expect(html).toContain('placeholder="Selecione uma moeda"');
		expect(html).toContain('type="hidden" name="creditLimit" value="1500"');
		expect(html).not.toContain("R$");
	}
});

test("configured currencies retain their monetary format and editable input", () => {
	for (const currency of ["BRL", "USD", "JPY", "KWD"]) {
		const html = renderField(currency, "1500");
		const formatted = new Intl.NumberFormat("pt-BR", { currency, style: "currency" }).format(1500);
		expect(html).toContain(`value="${formatted}"`);
		expect(html).not.toContain('disabled=""');
	}
});
