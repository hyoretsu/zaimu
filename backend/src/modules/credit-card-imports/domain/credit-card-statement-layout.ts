import { HttpException } from "~/shared/errors";
import type { CreditCardImportProvider, CreditCardStatement } from "./credit-card-statement";

export interface CreditCardStatementLayout {
	id: string;
	matches: (text: string) => boolean;
	parse: (text: string) => CreditCardStatement;
	provider: CreditCardImportProvider;
}

/** Select by document structure, never by whether a parser happens to accept the text. */
export function selectCreditCardStatementLayout(
	text: string,
	provider: CreditCardImportProvider,
	layouts: readonly CreditCardStatementLayout[],
) {
	const providerLayouts = layouts.filter(layout => layout.provider === provider);
	if (!providerLayouts.length) throw new HttpException("Instituição de cartão não suportada", 400);
	const matches = providerLayouts.filter(layout => layout.matches(text));
	if (!matches.length) throw new HttpException("Layout de fatura não reconhecido para esta instituição", 400);
	if (matches.length > 1)
		throw new HttpException("Não foi possível identificar um único layout para esta fatura", 400);
	return matches[0]!;
}
