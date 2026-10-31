import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FinancialAccount } from "@/lib/api";
import { getFinancialAccountDisplayName } from "@/lib/financial-account";

export function TransferAccountSelection({
	accounts,
	baseIds,
	selected,
	related,
	loading,
	error,
	onRetry,
	onSelect,
}: {
	accounts: FinancialAccount[];
	baseIds: string[];
	selected: string[];
	related: Array<{ id: string; reasons: string[] }>;
	loading: boolean;
	error: boolean;
	onRetry: () => void;
	onSelect: (id: string, checked: boolean) => void;
}) {
	const formId = useId();
	return (
		<div className="space-y-4">
			<section aria-label="Contas que serão transferidas" className="space-y-2">
				<h3 className="font-semibold">Contas que serão transferidas</h3>
				{accounts
					.filter(account => baseIds.includes(account.id))
					.map(account => (
						<p className="rounded-xl border p-3" key={account.id}>
							{getFinancialAccountDisplayName(account)}
							{account.isHidden ? " - Escondida" : ""}
						</p>
					))}
			</section>
			{loading ? (
				<div className="space-y-3">
					<Skeleton className="h-5 w-56" />
					<Skeleton className="h-20 w-full" />
				</div>
			) : error ? (
				<div role="alert">
					<p>Não foi possível verificar contas vinculadas.</p>
					<Button onClick={onRetry} type="button" variant="outline">
						Tentar novamente
					</Button>
				</div>
			) : related.length ? (
				<fieldset className="space-y-3">
					<legend className="mb-2 font-semibold">Contas vinculadas</legend>
					<p className="text-muted-foreground text-sm">
						Selecione apenas se também quiser transferi-las. Vínculos com contas que ficarem serão
						separados.
					</p>
					{accounts
						.filter(account => related.some(link => link.id === account.id))
						.map(account => (
							<label
								className="flex cursor-pointer items-center gap-3 rounded-xl border p-3"
								htmlFor={`${formId}-${account.id}`}
								key={account.id}
							>
								<Checkbox
									checked={selected.includes(account.id)}
									id={`${formId}-${account.id}`}
									onCheckedChange={checked => onSelect(account.id, checked === true)}
								/>
								<span className="min-w-0 break-words">
									<span className="block">
										{getFinancialAccountDisplayName(account)}
										{account.isHidden ? " - Escondida" : ""}
									</span>
									<span className="text-muted-foreground block text-xs">
										{related.find(link => link.id === account.id)?.reasons.join(" · ")}
									</span>
								</span>
							</label>
						))}
				</fieldset>
			) : baseIds.length > 0 ? (
				<p className="text-muted-foreground text-sm">Nenhuma outra conta vinculada a esta seleção.</p>
			) : null}
		</div>
	);
}
