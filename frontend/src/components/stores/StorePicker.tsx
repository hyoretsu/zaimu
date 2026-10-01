import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuChevronDown, LuPlus, LuStore } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function StorePicker({
	disabled,
	onValueChange,
	value,
}: {
	disabled?: boolean;
	onValueChange: (storeName: string) => void;
	value: string;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [searchInput, setSearchInput] = useDebouncedInput(search, setSearch);
	const storesQuery = useInfiniteQuery({
		enabled: open && identity !== null,
		getNextPageParam: page => (page.hasMore ? (page.nextCursor ?? undefined) : undefined),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => dataService.stores.getPage({ cursor: pageParam, limit: 50, search }),
		queryKey: [...queryKeys.stores.list(identity!), { search }],
	});
	const normalizedSearch = searchInput.trim().toLocaleLowerCase("pt-BR");
	const stores = [
		...new Set(storesQuery.data?.pages.flatMap(page => page.items.map(store => store.name)) ?? []),
	];
	const exactMatch = stores.find(storeName => storeName.toLocaleLowerCase("pt-BR") === normalizedSearch);
	const selectStore = (storeName: string) => {
		onValueChange(storeName);
		setSearchInput("");
		setSearch("");
		setOpen(false);
	};
	const createStore = useMutation({
		mutationFn: (name: string) => dataService.stores.create(name),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível criar a loja.", "negative"),
		onSuccess: async store => {
			selectStore(store.name);
			await invalidateCacheOperation(queryClient, identity!, "store");
			showToast(`Loja “${store.name}” criada.`, "positive");
		},
	});
	const createOrSelectStore = () => {
		const storeName = searchInput.trim();
		if (!storeName || searchInput !== search || storesQuery.isFetching) return;
		if (exactMatch) {
			selectStore(exactMatch);
			return;
		}
		createStore.mutate(storeName);
	};

	return (
		<div className="grid gap-2">
			<p className="font-medium text-sm">Loja</p>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						aria-label="Selecionar loja"
						className="h-auto min-h-10 w-full cursor-pointer justify-between gap-3 rounded-2xl px-3 py-2 font-normal"
						disabled={disabled}
						type="button"
						variant="outline"
					>
						<span className="flex min-w-0 flex-1 items-center gap-2 text-left">
							<LuStore className="shrink-0 text-muted-foreground" />
							<span className={value ? "truncate" : "text-muted-foreground"}>
								{value || "Selecione ou crie uma loja"}
							</span>
						</span>
						<LuChevronDown className="shrink-0 text-muted-foreground" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--radix-popover-trigger-width) min-w-72 gap-3 p-3"
					portal={false}
				>
					<div className="flex gap-2">
						<Input
							autoComplete="organization"
							name="store-search"
							onChange={event => setSearchInput(event.currentTarget.value)}
							onKeyDown={event => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								createOrSelectStore();
							}}
							placeholder="Ex: Supermercado São José"
							type="text"
							value={searchInput}
						/>
						<Button
							aria-label={exactMatch ? "Selecionar loja" : "Adicionar loja"}
							className="cursor-pointer"
							disabled={
								!searchInput.trim() ||
								createStore.isPending ||
								searchInput !== search ||
								storesQuery.isFetching
							}
							onClick={createOrSelectStore}
							size="icon"
							type="button"
						>
							<LuPlus />
						</Button>
					</div>
					<ScrollArea className="h-52 min-h-0">
						<div className="pr-3">
							{storesQuery.isPending ? (
								<div className="grid gap-2">
									{[1, 2, 3].map(item => (
										<Skeleton className="h-9 rounded-xl" key={item} />
									))}
								</div>
							) : storesQuery.isError ? (
								<div className="grid gap-2 p-2">
									<p className="text-sm">Não foi possível carregar lojas.</p>
									<Button
										className="cursor-pointer"
										onClick={() => storesQuery.refetch()}
										type="button"
										variant="outline"
									>
										Tentar novamente
									</Button>
								</div>
							) : (
								<div className="grid gap-1">
									<Button
										className="cursor-pointer justify-start rounded-xl px-2 py-2 font-normal"
										onClick={() => selectStore("")}
										type="button"
										variant={value ? "outline" : "secondary"}
									>
										<LuStore className="text-muted-foreground" />
										<span className="truncate">Sem loja</span>
									</Button>
									{stores.map(storeName => (
										<Button
											className="cursor-pointer justify-start rounded-xl px-2 py-2 font-normal"
											key={storeName}
											onClick={() => selectStore(storeName)}
											type="button"
											variant={value === storeName ? "secondary" : "outline"}
										>
											<LuStore className="text-muted-foreground" />
											<span className="truncate">{storeName}</span>
										</Button>
									))}
									{storesQuery.hasNextPage && (
										<Button
											className="cursor-pointer"
											disabled={storesQuery.isFetchingNextPage}
											onClick={() => storesQuery.fetchNextPage()}
											type="button"
											variant="outline"
										>
											{storesQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
										</Button>
									)}
									{!stores.length && (
										<p className="px-2 py-6 text-center text-muted-foreground text-sm">
											Nenhuma loja encontrada. Use + para adicionar.
										</p>
									)}
								</div>
							)}
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>
		</div>
	);
}
