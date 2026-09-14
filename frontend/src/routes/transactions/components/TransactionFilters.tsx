import { useId, useState } from "react";
import { LuChevronDown, LuChevronUp, LuSearch, LuSlidersHorizontal, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Input } from "@/components/ui/Input";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Transaction } from "@/lib/api";
import {
	countActiveTransactionFilters,
	type TransactionFilters as TransactionFiltersValue,
} from "../-transaction-filters";

interface TransactionFiltersProps {
	filters: TransactionFiltersValue;
	onChange: (filters: TransactionFiltersValue) => void;
	onClear: () => void;
	transactions: Transaction[];
}

export function TransactionFilters({ filters, onChange, onClear, transactions }: TransactionFiltersProps) {
	const isMobile = useMediaQuery("(max-width: 639px)");
	const [expanded, setExpanded] = useState(!isMobile);
	const contentId = useId();
	const [search, setSearch] = useDebouncedInput(filters.search, value =>
		onChange({ ...filters, search: value }),
	);
	const accounts = new Map<string, string>();
	const categories = new Map<string, string>();
	for (const transaction of transactions) {
		if (transaction.originFinancialAccountId && transaction.originName)
			accounts.set(transaction.originFinancialAccountId, transaction.originName);
		if (transaction.destinationFinancialAccountId && transaction.destinationName)
			accounts.set(transaction.destinationFinancialAccountId, transaction.destinationName);
		for (const tag of transaction.tags ?? []) categories.set(tag.id, tag.name);
		if (transaction.categoryId && transaction.categoryName)
			categories.set(transaction.categoryId, transaction.categoryName);
	}
	const activeFilterCount = countActiveTransactionFilters(filters);
	const hasFilters = activeFilterCount > 0;
	const set = <Key extends keyof TransactionFiltersValue>(key: Key, value: TransactionFiltersValue[Key]) =>
		onChange({ ...filters, [key]: value });

	return (
		<section aria-label="Filtros de transações" className="rounded-2xl border bg-card p-2 shadow-sm">
			<Button
				aria-controls={contentId}
				aria-expanded={expanded}
				className="w-full cursor-pointer justify-between"
				onClick={() => setExpanded(current => !current)}
				type="button"
				variant="outline"
			>
				<span className="flex items-center gap-2">
					<LuSlidersHorizontal /> Filtros
				</span>
				<span className="flex items-center gap-2 text-muted-foreground">
					{hasFilters ? `${activeFilterCount} ${activeFilterCount === 1 ? "ativo" : "ativos"}` : null}
					{expanded ? <LuChevronUp /> : <LuChevronDown />}
				</span>
			</Button>
			{expanded ? (
				<div className="space-y-3 p-2 pt-4" id={contentId}>
					<div className="relative">
						<LuSearch
							aria-hidden="true"
							className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							aria-label="Pesquisar transações"
							className="h-10 pl-9"
							name="transaction-search"
							onChange={event => setSearch(event.currentTarget.value)}
							placeholder="Pesquisar descrição, valor, conta, categoria, data..."
							type="text"
							value={search}
						/>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						<DateRangePicker
							onChange={value => set("dateRange", value)}
							title="Filtrar por data"
							value={filters.dateRange}
						/>
						<CustomSelect
							label="Tipo"
							onValueChange={value => set("type", value as TransactionFiltersValue["type"])}
							options={[
								{ label: "Todos", value: "all" },
								{ label: "Entradas", value: "INCOME" },
								{ label: "Saídas", value: "EXPENSE" },
								{ label: "Transferências", value: "TRANSFER" },
							]}
							placeholder="Todos os tipos"
							sortOptions={false}
							value={filters.type}
						/>
						<CustomSelect
							label="Origem"
							onValueChange={value => set("source", value as TransactionFiltersValue["source"])}
							options={[
								{ label: "Todas", value: "all" },
								{ label: "Conta", value: "FINANCIAL_ACCOUNT" },
								{ label: "Cartão de crédito", value: "CREDIT_CARD" },
							]}
							placeholder="Todas as origens"
							sortOptions={false}
							value={filters.source}
						/>
						<CustomSelect
							label="Visibilidade"
							onValueChange={value => set("visibility", value as TransactionFiltersValue["visibility"])}
							options={[
								{ label: "Todas", value: "all" },
								{ label: "Visíveis", value: "visible" },
								{ label: "Ocultas", value: "hidden" },
							]}
							placeholder="Todas as transações"
							sortOptions={false}
							value={filters.visibility}
						/>
						<CustomSelect
							label="Conta"
							onValueChange={value => set("accountId", value)}
							options={[
								{ label: "Todas as contas", value: "all" },
								...[...accounts].map(([value, label]) => ({ label, value })),
							]}
							placeholder="Todas as contas"
							value={filters.accountId}
						/>
						<CustomSelect
							label="Categoria"
							onValueChange={value => set("categoryId", value)}
							options={[
								{ label: "Todas as categorias", value: "all" },
								...[...categories].map(([value, label]) => ({ label, value })),
							]}
							placeholder="Todas as categorias"
							value={filters.categoryId}
						/>
					</div>
					{hasFilters ? (
						<Button className="cursor-pointer" onClick={onClear} size="sm" type="button" variant="outline">
							<LuX /> Limpar filtros
						</Button>
					) : null}
				</div>
			) : null}
		</section>
	);
}
