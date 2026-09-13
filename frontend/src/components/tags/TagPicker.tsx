import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LuChevronDown, LuPlus, LuTags } from "react-icons/lu";
import { Badge } from "@/components/ui/Badge";
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
	const [searchInput, setSearchInput] = useDebouncedInput("", () => undefined);
	const tagsQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.categories.getAll(),
		queryKey: queryKeys.categories.list(identity!),
	});
	const createTag = useMutation({
		mutationFn: (name: string) => dataService.categories.create({ name }),
		onError: error => {
			showToast(error instanceof Error ? error.message : "Não foi possível criar a tag.", "negative");
		},
		onSuccess: async tag => {
			onValueChange([...new Set([...value, tag.id])]);
			setSearchInput("");
			await invalidateCacheOperation(queryClient, identity!, "category");
			showToast(`Tag “${tag.name}” criada.`, "positive");
		},
	});
	const normalizedSearch = searchInput.trim().toLocaleLowerCase("pt-BR");
	const tags = (tagsQuery.data ?? []).toSorted((left, right) =>
		left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }),
	);
	const filteredTags = tags.filter(tag => tag.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
	const selectedTags = tags.filter(tag => value.includes(tag.id));
	const exactMatch = tags.find(tag => tag.name.toLocaleLowerCase("pt-BR") === normalizedSearch);

	const toggleTag = (tagId: string) => {
		onValueChange(value.includes(tagId) ? value.filter(id => id !== tagId) : [...value, tagId]);
	};

	const createOrSelectTag = () => {
		const name = searchInput.trim();
		if (!name) return;
		if (exactMatch) {
			if (!value.includes(exactMatch.id)) onValueChange([...value, exactMatch.id]);
			setSearchInput("");
			return;
		}
		createTag.mutate(name);
	};

	return (
		<div className="grid gap-2">
			<p className="font-medium text-sm">Tags</p>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						aria-label="Selecionar tags"
						className="h-auto min-h-10 w-full cursor-pointer justify-between gap-3 rounded-2xl px-3 py-2 font-normal"
						disabled={disabled}
						type="button"
						variant="outline"
					>
						<span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-left">
							{selectedTags.length ? (
								selectedTags.map(tag => (
									<Badge className="max-w-40" key={tag.id} variant="secondary">
										<span
											aria-hidden="true"
											className="size-2 shrink-0 rounded-full"
											style={{ backgroundColor: tag.color || "var(--primary)" }}
										/>
										<span className="truncate">{tag.name}</span>
									</Badge>
								))
							) : (
								<span className="flex items-center gap-2 text-muted-foreground">
									<LuTags /> Selecione ou crie tags
								</span>
							)}
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
							disabled={!searchInput.trim() || createTag.isPending}
							onClick={createOrSelectTag}
							size="icon"
							type="button"
						>
							<LuPlus />
						</Button>
					</div>
					<ScrollArea className="h-52 pr-3">
						{tagsQuery.isPending ? (
							<div className="grid gap-2">
								{[1, 2, 3].map(item => (
									<Skeleton className="h-9 rounded-xl" key={item} />
								))}
							</div>
						) : filteredTags.length ? (
							<div className="grid gap-1">
								{filteredTags.map(tag => (
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
							</div>
						) : (
							<p className="px-2 py-6 text-center text-muted-foreground text-sm">
								Nenhuma tag encontrada. Use + para criar.
							</p>
						)}
					</ScrollArea>
				</PopoverContent>
			</Popover>
		</div>
	);
}
