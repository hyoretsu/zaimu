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

const formatDate = (value: string) => value.split("-").reverse().join("/");

const normalize = (value: string) =>
	value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();

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
	const accounts = useMemo(() => {
		const term = normalize(search.trim());
		return term ? imports.filter(({ accountName }) => normalize(accountName).includes(term)) : imports;
	}, [imports, search]);
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Selecionar conta para revisão</DialogTitle>
					<DialogDescription>
						Escolha uma conta para revisar as transações restantes de todos os seus extratos de
						uma só vez. As com menos transações restantes aparecem primeiro; em caso de empate, as
						mais recentes.
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
								aria-label="Pesquisar contas"
								className="h-10 pl-9"
								name="import-search"
								onChange={event => setSearch(event.currentTarget.value)}
								placeholder="Nome da conta..."
								type="text"
								value={search}
							/>
						</div>
						{accounts.length === 0 ? (
							<p className="text-muted-foreground py-6 text-center text-sm">
								Nenhuma conta encontrada.
							</p>
						) : null}
						{accounts.map(account => (
							<Button
								className="h-auto w-full max-w-full min-w-0 cursor-pointer justify-start gap-3 overflow-hidden px-4 py-3 text-left whitespace-normal"
								key={account.id}
								onClick={() => {
									onOpenChange(false);
									onReview(account.id);
								}}
								variant="outline"
							>
								<LuFileSearch className="mt-0.5 size-5 shrink-0 text-amber-700" />
								<span className="w-0 min-w-0 flex-1 space-y-1 overflow-hidden">
									<span className="block truncate font-semibold">
										{account.accountName}
									</span>
									<span className="text-muted-foreground block truncate text-xs">
										{account.pendingItemCount}{" "}
										{account.pendingItemCount === 1 ? "transação" : "transações"}
										{account.firstDate && account.lastDate
											? `, ${formatDate(account.firstDate)} a ${formatDate(account.lastDate)}`
											: ""}
									</span>
								</span>
							</Button>
						))}
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
