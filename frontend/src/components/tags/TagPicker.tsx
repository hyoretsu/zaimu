import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuChevronDown, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Input } from "@/components/ui/Input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { SelectedTags } from "./components";

export function TagPicker({
	disabled,
	onValueChange,
	value,
}: {
	disabled?: boolean;
	onValueChange: (tagIds: string[]) => void;
	value: string[];
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [searchInput, setSearchInput] = useDebouncedInput(search, setSearch);
	const selectedIds = [...new Set(value)].sort();
	const selectedQuery = useQuery({
		enabled: identity !== null && selectedIds.length > 0,
		queryFn: () => dataService.categories.getByIds(selectedIds),
		queryKey: [...queryKeys.categories.all(identity!), "selected", selectedIds],
	});
	const tagsQuery = useInfiniteQuery({
		enabled: open && identity !== null,
		getNextPageParam: page => (page.hasMore ? (page.nextCursor ?? undefined) : undefined),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => dataService.categories.getPage({ cursor: pageParam, limit: 50, search }),
		queryKey: [...queryKeys.categories.list(identity!), { search }],
	});
	const createTag = useMutation({
		mutationFn: (name: string) => dataService.categories.create({ name }),
		onError: error => {
			showToast(error instanceof Error ? error.message : "Não foi possível criar a tag.", "negative");
		},
		onSuccess: async tag => {
			onValueChange([...new Set([...value, tag.id])]);
			setSearchInput("");
			setSearch("");
			await invalidateCacheOperation(queryClient, identity!, "category");
			showToast(`Tag “${tag.name}” criada.`, "positive");
		},
	});
	const normalizedSearch = searchInput.trim().toLocaleLowerCase("pt-BR");
	const tags = tagsQuery.data?.pages.flatMap(page => page.items) ?? [];
	const exactMatch = tags.find(tag => tag.name.toLocaleLowerCase("pt-BR") === normalizedSearch);

	const toggleTag = (tagId: string) => {
		onValueChange(value.includes(tagId) ? value.filter(id => id !== tagId) : [...value, tagId]);
	};

	const createOrSelectTag = () => {
		const name = searchInput.trim();
		if (!name || searchInput !== search || tagsQuery.isFetching) return;
		if (exactMatch) {
			if (!value.includes(exactMatch.id)) onValueChange([...value, exactMatch.id]);
			setSearchInput("");
			setSearch("");
			return;
		}
		createTag.mutate(name);
	};

	return (
		<div className="grid gap-2">
			<p className="font-medium text-sm">Tags</p>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						aria-label="Selecionar tags"
						className="h-auto min-h-10 w-full cursor-pointer justify-between gap-3 rounded-2xl px-3 py-2 font-normal"
						disabled={disabled}
						type="button"
						variant="outline"
					>
						<span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-left">
							<SelectedTags
								failed={selectedQuery.isError}
								ids={selectedIds}
								pending={selectedQuery.isPending}
								tags={selectedQuery.data ?? []}
							/>
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
							autoComplete="off"
							name="tag-search"
							onChange={event => setSearchInput(event.currentTarget.value)}
							onKeyDown={event => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								createOrSelectTag();
							}}
							placeholder="Ex: Alimentação"
							type="text"
							value={searchInput}
						/>
						<Button
							aria-label={exactMatch ? "Selecionar tag" : "Criar tag"}
							className="cursor-pointer"
							disabled={
								!searchInput.trim() || createTag.isPending || searchInput !== search || tagsQuery.isFetching
							}
							onClick={createOrSelectTag}
							size="icon"
							type="button"
						>
							<LuPlus />
						</Button>
					</div>
					<ScrollArea className="h-52 min-h-0">
						<div className="pr-3">
							{tagsQuery.isPending ? (
								<div className="grid gap-2">
									{[1, 2, 3].map(item => (
										<Skeleton className="h-9 rounded-xl" key={item} />
									))}
								</div>
							) : tagsQuery.isError ? (
								<div className="grid gap-2 p-2">
									<p className="text-sm">Não foi possível carregar tags.</p>
									<Button
										className="cursor-pointer"
										onClick={() => tagsQuery.refetch()}
										type="button"
										variant="outline"
									>
										Tentar novamente
									</Button>
								</div>
							) : tags.length ? (
								<div className="grid gap-1">
									{tags.map(tag => (
										<CheckboxField
											checkboxProps={{
												checked: value.includes(tag.id),
												id: `tag-${tag.id}`,
												onCheckedChange: () => toggleTag(tag.id),
											}}
											className="w-full py-2"
											key={tag.id}
										>
											<span className="flex min-w-0 items-center gap-3">
												<span
													aria-hidden="true"
													className="size-2.5 shrink-0 rounded-full"
													style={{ backgroundColor: tag.color || "var(--primary)" }}
												/>
												<span className="truncate">{tag.name}</span>
											</span>
										</CheckboxField>
									))}
									{tagsQuery.hasNextPage && (
										<Button
											className="cursor-pointer"
											disabled={tagsQuery.isFetchingNextPage}
											onClick={() => tagsQuery.fetchNextPage()}
											type="button"
											variant="outline"
										>
											{tagsQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
										</Button>
									)}
								</div>
							) : (
								<p className="px-2 py-6 text-center text-muted-foreground text-sm">
									Nenhuma tag encontrada. Use + para criar.
								</p>
							)}
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>
			{selectedIds.length > 0 && selectedQuery.isError && (
				<Button
					className="cursor-pointer"
					onClick={() => selectedQuery.refetch()}
					type="button"
					variant="outline"
				>
					Tentar carregar tags selecionadas novamente
				</Button>
			)}
		</div>
	);
}
