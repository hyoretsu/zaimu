import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

const previousWebUrl = process.env.VITE_PUBLIC_WEB_URL;
process.env.VITE_PUBLIC_WEB_URL = "http://localhost:4177";
const { useAuthStore } = await import("@/stores");
const { YieldCalendarLifecycle } = await import("./YieldCalendarLifecycle");
if (previousWebUrl === undefined) delete process.env.VITE_PUBLIC_WEB_URL;
else process.env.VITE_PUBLIC_WEB_URL = previousWebUrl;

test("calendar lifecycle preserves wrapped application content", () => {
	const previous = useAuthStore.getState();
	const client = new QueryClient();
	client.setQueryData(["yield-calendar"], { countries: [], currencyCountries: [], holidays: [] });
	try {
		useAuthStore.setState({ isAuthenticated: false, isGuestMode: true, isInitialized: true });
		const html = renderToStaticMarkup(
			<QueryClientProvider client={client}>
				<YieldCalendarLifecycle>
					<main>Application content</main>
				</YieldCalendarLifecycle>
			</QueryClientProvider>,
		);
		expect(html).toContain("Application content");
	} finally {
		useAuthStore.setState(previous, true);
		client.clear();
	}
});
