import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RefundInstallmentOptions } from "./RefundInstallmentOptions";

test("refund summary lists invoice months across years and excess credit without individual controls", () => {
	const markup = renderToStaticMarkup(
		<RefundInstallmentOptions
			credit="R$23,64"
			direction="LAST"
			installments={[
				{ number: 8, statementDate: "2026-11-20" },
				{ number: 9, statementDate: "2026-12-20" },
				{ number: 10, statementDate: "2027-01-20" },
				{ number: 11, statementDate: "2027-02-20" },
			]}
			onDirectionChange={() => {}}
			selected={[8, 9, 10, 11]}
		/>,
	);
	expect(markup.replace(/<[^>]*>/gu, "")).toContain("Parcelas afetadas: Nov/26, Dez/26, Jan/27 e Fev/27");
	expect(markup).toContain("Crédito excedente: R$23,64");
	expect(markup).not.toContain('role="checkbox"');
	expect(markup).not.toContain("Quantidade");
});
