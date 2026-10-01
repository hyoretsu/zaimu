import { LuTags } from "react-icons/lu";
import { AppBadge } from "@/components/ui/AppBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Category } from "@/lib/api";

export function SelectedTags({
	ids,
	tags,
	pending,
	failed,
}: {
	ids: string[];
	tags: Category[];
	pending: boolean;
	failed: boolean;
}) {
	if (ids.length && pending)
		return (
			<>
				{ids.map(id => (
					<Skeleton className="h-6 w-24 rounded-lg" key={id} />
				))}
			</>
		);
	if (ids.length && failed) return <span className="text-muted-foreground">Tags indisponíveis</span>;
	if (!ids.length)
		return (
			<span className="flex items-center gap-2 text-muted-foreground">
				<LuTags /> Selecione ou crie tags
			</span>
		);
	const byId = new Map(tags.map(tag => [tag.id, tag]));
	const selected: Pick<Category, "id" | "name" | "color">[] = ids
		.map(id => byId.get(id) ?? { id, name: "Tag indisponível" })
		.toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
	return (
		<>
			{selected.map(tag => (
				<AppBadge className="max-w-40" key={tag.id} variant="secondary">
					<span
						aria-hidden="true"
						className="size-2 shrink-0 rounded-full"
						style={{ backgroundColor: tag.color || "var(--primary)" }}
					/>
					<span className="truncate">{tag.name}</span>
				</AppBadge>
			))}
		</>
	);
}
