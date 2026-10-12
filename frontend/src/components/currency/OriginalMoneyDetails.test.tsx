import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OriginalMoneyDetails } from "./OriginalMoneyDetails";

test("same-currency transactions without applied fees hide redundant original amounts", () => {
	expect(
		renderToStaticMarkup(
			<OriginalMoneyDetails bookingCurrency="BRL" currency="BRL" originalAmount={95.99} />,
		),
	).toBe("");
	expect(
		renderToStaticMarkup(
			<OriginalMoneyDetails
				bookingCurrency="BRL"
				currency="BRL"
				fees={[{ amount: 0, name: "IOF", type: "PERCENTAGE" }]}
				originalAmount={95.99}
			/>,
		),
	).toBe("");
});

test("currency conversion preserves original amount even at equal nominal values", () => {
	const html = renderToStaticMarkup(
		<OriginalMoneyDetails bookingCurrency="BRL" currency="USD" originalAmount={20} />,
	);
	expect(html).toContain("Valor original:");
	expect(html).toContain("US$");
});

test("same-currency fees preserve original principal and fee details", () => {
	const html = renderToStaticMarkup(
		<OriginalMoneyDetails
			bookingCurrency="BRL"
			currency="BRL"
			fees={[{ amount: 3.5, name: "IOF", type: "PERCENTAGE" }]}
			originalAmount={100}
		/>,
	);
	expect(html).toContain("Valor original:");
	expect(html).toContain("100,00");
	expect(html).toContain("IOF: 3,5%");
});
