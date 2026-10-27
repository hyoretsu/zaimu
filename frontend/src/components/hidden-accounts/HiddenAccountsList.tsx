import type { FinancialAccount } from "@/lib/api";
import { HiddenAccountRow } from "./components";

export function HiddenAccountsList({ accounts, title }: { accounts: FinancialAccount[]; title: string }) {
	if (!accounts.length) return null;
	return (
		<section className="grid gap-3">
			<h2 className="text-lg font-bold">{title}</h2>
			{accounts.map(account => (
				<HiddenAccountRow account={account} key={account.id} />
			))}
		</section>
	);
}
