import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog } from "@/components/ui/Dialog";

const previousWebUrl = process.env.VITE_PUBLIC_WEB_URL;
process.env.VITE_PUBLIC_WEB_URL = "http://localhost:4177";
const { getCurrentCacheIdentity, queryKeys } = await import("@/lib/query-cache");
const { useAuthStore } = await import("@/stores/auth");
const { EditRecurringDialog } = await import("./EditRecurringDialog");
if (previousWebUrl === undefined) delete process.env.VITE_PUBLIC_WEB_URL;
else process.env.VITE_PUBLIC_WEB_URL = previousWebUrl;

import type { RecurringListItemData } from "./types";

const originalAuth = useAuthStore.getState();
afterEach(() => useAuthStore.setState(originalAuth, true));

const item: RecurringListItemData = {
	active: true,
	amount: 23.99,
	direction: "EXPENSE",
	frequency: "MONTHLY",
	id: "google-one",
	monthlyAmount: 23.99,
	source: "recurring",
	startDate: "2026-08-14",
	title: "Google One (5 TB)",
};

describe("recurrence edit initialization", () => {
	for (const staleTime of [0, Number.POSITIVE_INFINITY]) {
		test(`waits for current detail before mounting form with cached detail (staleTime=${staleTime})`, () => {
			useAuthStore.setState({ isAuthenticated: false, isGuestMode: true });
			const client = new QueryClient({ defaultOptions: { queries: { staleTime } } });
			const identity = getCurrentCacheIdentity()!;
			client.setQueryData([...queryKeys.recurring.all(identity), "detail", item.id], {
				id: item.id,
				name: "Google One (100 GB)",
			});
			client.setQueryData(queryKeys.accounts.list(identity), []);
			function Probe() {
				const element = EditRecurringDialog({ item, onOpenChange: () => {} });
				expect(element.type).toBe(Dialog);
				return element;
			}
			renderToStaticMarkup(
				<QueryClientProvider client={client}>
					<Probe />
				</QueryClientProvider>,
			);
			client.clear();
		});
	}
});
