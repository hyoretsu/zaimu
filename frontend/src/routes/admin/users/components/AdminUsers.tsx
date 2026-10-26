import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuShieldPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { useUrlViewState } from "@/hooks/use-url-view-state";
import { getAdminUsers, postAdminUsersByIdPromote } from "@/lib/api";
import { mutationCacheMeta } from "@/lib/mutation-cache";
import { useCacheIdentity } from "@/lib/query-cache";
import { viewString } from "@/lib/view-state";
import { showToast } from "@/stores";
export function AdminUsers() {
	const identity = useCacheIdentity();
	const [search, setSearch] = useUrlViewState("search", "", viewString);
	const [local, setLocal] = useDebouncedInput(search, setSearch);
	const users = useQuery({
		enabled: search.trim().length >= 3,
		queryFn: () => getAdminUsers({ email: search }),
		queryKey: ["admin-users", identity, search],
	});
	const [pending, setPending] = useState<string[]>([]);
	const promote = useMutation({
		meta: mutationCacheMeta("adminUser"),
		mutationFn: (id: string) => postAdminUsersByIdPromote(id),
		onError: error => showToast(error.message, "negative"),
		onMutate: id => setPending(current => [...current, id]),
		onSettled: (_data, _error, id) => setPending(current => current.filter(value => value !== id)),
		onSuccess: () => {
			showToast("Permissão administrativa concedida.", "positive");
		},
	});
	return (
		<section className="bg-card grid gap-3 rounded-2xl border p-4 sm:p-6">
			<h2 className="text-lg font-semibold">Administradores</h2>
			<label className="grid gap-2" htmlFor="admin-user-search">
				Buscar por e-mail
				<Input
					id="admin-user-search"
					name="admin-user-search"
					onChange={event => setLocal(event.currentTarget.value)}
					placeholder="Ex: pessoa@exemplo.com"
					type="text"
					value={local}
				/>
			</label>
			{search.trim().length < 3 ? (
				<p className="text-muted-foreground text-sm">Digite pelo menos três caracteres.</p>
			) : users.isPending ? (
				<Skeleton className="h-20 w-full" />
			) : users.isError ? (
				<p role="alert">{users.error.message}</p>
			) : users.data.length === 0 ? (
				<p>Nenhum usuário encontrado.</p>
			) : (
				users.data.map(user => (
					<div
						className="bg-background/50 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
						key={user.id}
					>
						<div className="min-w-0">
							<p className="truncate">{user.email}</p>
							<p className="text-muted-foreground text-sm">
								{user.role === "ADMIN" ? "Administrador" : "Usuário"}
							</p>
						</div>
						<ActionGroup>
							<Button
								disabled={user.role === "ADMIN" || pending.includes(user.id)}
								onClick={() => promote.mutate(user.id)}
								variant="outline"
							>
								<LuShieldPlus />
								Conceder admin
							</Button>
						</ActionGroup>
					</div>
				))
			)}
		</section>
	);
}
