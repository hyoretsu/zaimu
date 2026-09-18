import { expect, test } from "bun:test";
import { matchLegacyFinancingRoots } from "./legacy-financing-roots";

test("matches both old CINEPOLIS installment roots without creating a duplicate", () => {
	const roots = new Map<string, string>();
	matchLegacyFinancingRoots(
		[
			{
				description: "FIN CINEPOLIS · IOF R$ 0,02",
				externalId: "new-16",
				installments: 16,
				purchaseDate: "2025-11-09",
			},
			{
				description: "FIN CINEPOLIS · IOF R$ 0,02",
				externalId: "new-11",
				installments: 11,
				purchaseDate: "2025-11-09",
			},
		],
		[
			{ description: "FIN CINEPOLIS", id: "old-16", installments: 16, purchaseDate: "2025-11-09" },
			{ description: "FIN CINEPOLIS", id: "old-11", installments: 11, purchaseDate: "2025-11-09" },
		],
		roots,
	);
	expect([...roots]).toEqual([
		["new-16", "old-16"],
		["new-11", "old-11"],
	]);
});

test("refuses to guess when old financing roots are ambiguous", () => {
	expect(() =>
		matchLegacyFinancingRoots(
			[
				{
					description: "FIN CINEPOLIS · IOF R$ 0,02",
					externalId: "new",
					installments: 16,
					purchaseDate: "2025-11-09",
				},
			],
			[
				{ description: "FIN CINEPOLIS", id: "one", installments: 16, purchaseDate: "2025-11-09" },
				{ description: "FIN CINEPOLIS", id: "two", installments: 16, purchaseDate: "2025-11-09" },
			],
			new Map(),
		),
	).toThrow("ambíguos");
});
