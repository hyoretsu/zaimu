import "@/index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { TooltipProvider } from "@/components/ui/Tooltip";
import type { FinancialInstitution } from "@/lib/api";
import { InstitutionYieldEditor } from "@/routes/accounts/components/InstitutionYieldDialog/InstitutionYieldEditor";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
	<QueryClientProvider client={client}>
		<TooltipProvider>
			<Dialog open>
				<DialogContent>
					<InstitutionYieldEditor
						institution={
							{
								id: "fixture",
								name: "Fixture",
								operatingCountryCodes: ["BR"],
							} as FinancialInstitution
						}
						onClose={() => {}}
						onUpdate={async (_institution, policy) => {
							Object.assign(window, { submittedPolicy: policy });
						}}
					/>
				</DialogContent>
			</Dialog>
		</TooltipProvider>
	</QueryClientProvider>,
);
