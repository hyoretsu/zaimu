import "@/index.css";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
	useLocation,
	useRouter,
} from "@tanstack/react-router";
import { Activity, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { LuPlus } from "react-icons/lu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { MobilePageActions } from "@/components/ui/MobilePageActions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";

function OverlayDismissalFixture() {
	const pathname = useLocation().pathname;
	const router = useRouter();
	const [invoiceOpen, setInvoiceOpen] = useState(false);
	const [editing, setEditing] = useState(false);
	return (
		<>
			<button
				className="relative z-[100]"
				onClick={() => router.history.push(pathname === "/" ? "/other" : "/")}
				type="button"
			>
				Navigate
			</button>
			<Activity mode={pathname === "/" ? "visible" : "hidden"}>
				<button onClick={() => setInvoiceOpen(true)} type="button">
					Open invoice
				</button>
				<Dialog onOpenChange={setInvoiceOpen} open={invoiceOpen}>
					<DialogContent>
						<DialogTitle>Invoice</DialogTitle>
						<button onClick={() => setEditing(true)} type="button">
							Edit purchase
						</button>
						{editing && (
							<Dialog onOpenChange={setEditing} open={editing}>
								<DialogContent>
									<DialogTitle>Edit purchase</DialogTitle>
								</DialogContent>
							</Dialog>
						)}
					</DialogContent>
				</Dialog>
				<MobilePageActions
					actions={[
						{ icon: LuPlus, label: "New purchase", onClick: () => undefined },
						{ icon: LuPlus, label: "New card", onClick: () => undefined },
					]}
				/>
				<Popover>
					<PopoverTrigger>Open actions</PopoverTrigger>
					<PopoverContent>Screen actions</PopoverContent>
				</Popover>
			</Activity>
		</>
	);
}

const rootRoute = createRootRoute({ component: OverlayDismissalFixture });
const router = createRouter({
	history: createMemoryHistory({ initialEntries: ["/"] }),
	routeTree: rootRoute.addChildren([
		createRoute({ getParentRoute: () => rootRoute, path: "/" }),
		createRoute({ getParentRoute: () => rootRoute, path: "/other" }),
	]),
});
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
