/** Historical Mercado Pago PDFs encode their regular font with a broken Unicode map.
 * Bold headers use a different font and must remain untouched. Only decode lines
 * carrying the legacy currency marker or the affected calendar labels.
 */
export function normalizeMercadoPagoText(text: string) {
	text = text.replace(/^Próximo fechamento\s+(\d{2}\/\d{2}\/\d{4})$/gmu, "Fechamento da próxima fatura $1");
	if (!/Valor em \$9/u.test(text) || !/\+echamento da fatura/u.test(text)) return text;
	const characters: Record<string, string> = {
		_: "X",
		")": "8",
		"%": "7",
		"+": "F",
		"=": "K",
		$: "R",
		"4": "C",
		"7": "J",
		"9": "$",
		B: "G",
		F: "I",
		G: "U",
		H: "Z",
		J: ".",
		K: "Y",
		M: "9",
		N: "B",
		U: "*",
		X: "N",
		Y: "H",
		Z: "_",
		ê: "M",
		í: "4",
		õ: "D",
	};
	return text
		.split("\n")
		.map(line => {
			if (line.includes("$9")) return line.replace(/./gu, character => characters[character] ?? character);
			if (line.startsWith("+echamento da fatura")) return line.replace("+echamento", "Fechamento");
			const next = line.match(/^Prx\.imo fechamento\s+(.+)$/u);
			if (next)
				return `Fechamento da próxima fatura ${next[1]!.replace(/[í)%M]/gu, character => characters[character]!)}`;
			return line;
		})
		.join("\n");
}
