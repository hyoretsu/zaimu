import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import type { StorageOwner } from "@/lib/localStorage";
import { useCacheIdentity } from "@/lib/query-cache";

export function LocalUpgradeReview({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) {
	const identity = useCacheIdentity();
	const [choices, setChoices] = useState<Record<string, StorageOwner>>({});
	const [pending, setPending] = useState(false);
	const review = useQuery({
		queryFn: async () => (await import("@/lib/upgrades/local-upgrade")).loadOwnershipReview(),
		queryKey: ["local-upgrade-review"],
		retry: false,
	});
	const owners = [...new Set([...(review.data?.owners ?? []), ...(identity ? [identity] : [])])];
	return (
		<main className="mx-auto grid h-dvh max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-4 p-6">
			<div>
				<h1 className="font-semibold text-xl">Revisar dados locais</h1>
				<p role="alert">{error}</p>
				<p>
					Originais preservados. Escolha explicitamente o proprietário de cada registro sem identificação.
				</p>
			</div>
			<ScrollArea className="min-h-0 rounded-xl border">
				<div className="space-y-4 p-4">
					{review.isPending ? (
						<Skeleton className="h-32 w-full" />
					) : review.error ? (
						<p role="alert">{review.error.message}</p>
					) : (
						review.data?.rows.map(row => {
							const key = `${row.domain}:${row.localId}`;
							return (
								<div className="grid gap-2 rounded-lg border p-3" key={key}>
									<p>
										{row.domain} - {row.description}
									</p>
									<CustomSelect
										label="Proprietário"
										onValueChange={value =>
											setChoices(previous => ({ ...previous, [key]: value as StorageOwner }))
										}
										options={owners.map(owner => ({ label: owner, value: owner }))}
										placeholder="Escolha o proprietário"
										required
										searchable
										value={choices[key]}
									/>
								</div>
							);
						})
					)}
				</div>
			</ScrollArea>
			<Button
				className="cursor-pointer"
				disabled={
					pending ||
					review.isPending ||
					(review.data?.rows.some(row => !choices[`${row.domain}:${row.localId}`]) ?? false)
				}
				onClick={async () => {
					setPending(true);
					try {
						const rows = review.data?.rows ?? [];
						if (rows.length)
							await (await import("@/lib/upgrades/local-upgrade")).saveOwnershipReview(
								rows.map(row => ({
									domain: row.domain,
									localId: row.localId,
									ownerKey: choices[`${row.domain}:${row.localId}`],
								})),
							);
						await onRetry();
						toast.success("Revisão local salva");
					} catch (cause) {
						toast.error(cause instanceof Error ? cause.message : "Não foi possível concluir revisão");
					} finally {
						setPending(false);
					}
				}}
			>
				{pending ? "Conferindo dados..." : "Salvar e conferir"}
			</Button>
		</main>
	);
}
