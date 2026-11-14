import { useMemo, useState } from "react";
import { LuFileSearch, LuSearch } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import type { TransactionImportSummary } from "@/lib/api";

const normalize = (value: string) =>
	value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();

function groupByAccount(imports: TransactionImportSummary[]) {
	const groups = new Map<string, { accountName: string; imports: TransactionImportSummary[] }>();
	for (const transactionImport of imports) {
		const group = groups.get(transactionImport.financialAccountId);
		if (group) group.imports.push(transactionImport);
		else
			groups.set(transactionImport.financialAccountId, {
				accountName: transactionImport.accountName ?? "Conta",
				imports: [transactionImport],
			});
	}
	return [...groups.entries()]
		.map(([id, group]) => ({ id, ...group }))
		.sort((a, b) => a.accountName.localeCompare(b.accountName, "pt-BR"));
}

export function PendingTransactionImportsDialog({
	imports,
	onOpenChange,
	onReview,
	open,
}: {
	imports: TransactionImportSummary[];
	onOpenChange: (open: boolean) => void;
	onReview: (importId: string) => void;
	open: boolean;
}) {
	const [search, setSearch] = useState("");
	const groups = useMemo(() => {
		const term = normalize(search.trim());
		const matching = term
			? imports.filter(
					({ accountName, fileName }) =>
						normalize(fileName).includes(term) || normalize(accountName).includes(term),
				)
			: imports;
		return groupByAccount(matching);
	}, [imports, search]);
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Selecionar extrato para revisão</DialogTitle>
					<DialogDescription>
						Escolha um extrato. Eles são agrupados por conta; dentro de cada conta, os com menos
						transações restantes aparecem primeiro e, em caso de empate, os mais recentes.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div className="space-y-4">
						<div className="relative">
							<LuSearch
								aria-hidden="true"
								className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
							/>
							<Input
								aria-label="Pesquisar extratos"
								className="h-10 pl-9"
								name="import-search"
								onChange={event => setSearch(event.currentTarget.value)}
								placeholder="Nome do extrato ou conta..."
								type="text"
								value={search}
							/>
						</div>
						{groups.length === 0 ? (
							<p className="text-muted-foreground py-6 text-center text-sm">
								Nenhum extrato encontrado.
							</p>
						) : null}
						{groups.map(group => (
							<section className="min-w-0 space-y-2" key={group.id}>
								<h3 className="text-muted-foreground truncate px-1 text-sm font-medium">
									{group.accountName}
								</h3>
								{group.imports.map(transactionImport => (
									<Button
										className="h-auto w-full max-w-full min-w-0 cursor-pointer justify-start gap-3 overflow-hidden px-4 py-3 text-left whitespace-normal"
										key={transactionImport.id}
										onClick={() => {
											onOpenChange(false);
											onReview(transactionImport.id);
										}}
										variant="outline"
									>
										<LuFileSearch className="mt-0.5 size-5 shrink-0 text-amber-700" />
										<span className="w-0 min-w-0 flex-1 space-y-1 overflow-hidden">
											<span className="block truncate font-semibold">
												{transactionImport.fileName}
											</span>
											<span className="text-muted-foreground block truncate text-xs">
												{transactionImport.pendingItemCount}{" "}
												{transactionImport.pendingItemCount === 1
													? "transação restante"
													: "transações restantes"}
											</span>
										</span>
									</Button>
								))}
							</section>
						))}
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
