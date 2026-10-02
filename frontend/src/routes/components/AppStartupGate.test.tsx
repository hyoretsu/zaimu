import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppStartupGate } from "./AppStartupGate";

test("authenticated app renders server content despite a failed or pending local database", () => {
	for (const isPending of [false, true]) {
		const html = renderToStaticMarkup(
			<AppStartupGate
				isAuthenticated
				isGuestMode={false}
				isInitialized
				localDatabase={{
					isError: !isPending,
					isFetching: isPending,
					isPending,
					refetch: async () => undefined,
				}}
			>
				<h1>Dashboard do servidor</h1>
			</AppStartupGate>,
		);
		expect(html).toContain("Dashboard do servidor");
		expect(html).not.toContain("Não foi possível abrir");
	}
});

test("guest app preserves storage failure instead of rendering empty financial content", () => {
	const html = renderToStaticMarkup(
		<AppStartupGate
			isAuthenticated={false}
			isGuestMode
			isInitialized
			localDatabase={{ isError: true, isFetching: false, isPending: false, refetch: async () => undefined }}
		>
			<h1>Dashboard local</h1>
		</AppStartupGate>,
	);
	expect(html).toContain("Não foi possível abrir");
	expect(html).not.toContain("Dashboard local");
	expect(html).not.toContain("outras abas");
});
