import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CardCalendarTransitionFields } from "./CardCalendarTransitionFields";

test("transition fields show dated preview and explicit installment policy", () => {
	const html = renderToStaticMarkup(
		<CardCalendarTransitionFields
			onChange={() => undefined}
			value={{
				dueDay: 24,
				effectiveDate: "2024-10-02",
				firstDueDate: "2024-10-24",
				firstStatementDate: "2024-10-17",
				installmentMode: "PER_CYCLE",
				statementDay: 17,
				transitionMode: "EXTRA_CYCLE",
				workingDueDate: true,
			}}
		/>,
	);
	expect(html).toContain("Vigência");
	expect(html).toContain("Primeiro fechamento");
	expect(html).toContain("Uma parcela por ciclo");
	expect(html).toContain("24/10/2024");
	expect(html).toContain("25/11/2024");
});
