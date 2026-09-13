import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
	const [searchInput, setSearchInput] = useDebouncedInput("", () => undefined);
	const storesQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.stores.getAll(),
		queryKey: queryKeys.stores.list(identity!),
	});
	const normalizedSearch = searchInput.trim().toLocaleLowerCase("pt-BR");
	const stores = [
		...new Set(
			(storesQuery.data ?? [])
				.map(store => store.name.trim())
				.filter((storeName): storeName is string => Boolean(storeName)),
		),
	].toSorted((left, right) => left.localeCompare(right, "pt-BR", { sensitivity: "base" }));
	const filteredStores = stores.filter(storeName =>
		storeName.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
	);
	const exactMatch = stores.find(storeName => storeName.toLocaleLowerCase("pt-BR") === normalizedSearch);
	const selectStore = (storeName: string) => {
		onValueChange(storeName);
		setSearchInput("");
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
		if (!storeName) return;
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
							disabled={!searchInput.trim() || createStore.isPending}
							onClick={createOrSelectStore}
							size="icon"
							type="button"
						>
							<LuPlus />
						</Button>
					</div>
					<ScrollArea className="h-52 pr-3">
						{storesQuery.isPending ? (
							<div className="grid gap-2">
								{[1, 2, 3].map(item => (
									<Skeleton className="h-9 rounded-xl" key={item} />
								))}
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
								{filteredStores.map(storeName => (
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
								{!filteredStores.length && (
									<p className="px-2 py-6 text-center text-muted-foreground text-sm">
										Nenhuma loja encontrada. Use + para adicionar.
									</p>
								)}
							</div>
						)}
					</ScrollArea>
				</PopoverContent>
			</Popover>
		</div>
	);
}
