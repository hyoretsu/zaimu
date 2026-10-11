import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuShieldPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { fetchWithAuth } from "@/lib/dataService";
import { showToast } from "@/stores";
export function AdminUsers() {
	const [search, setSearch] = useState("");
	const [local, setLocal] = useDebouncedInput(search, setSearch);
	const client = useQueryClient();
	const users = useQuery({
		enabled: search.trim().length >= 3,
		queryFn: () =>
			fetchWithAuth<Array<{ id: string; email: string; name: string; role: string }>>(
				`/admin/users?email=${encodeURIComponent(search)}`,
			),
		queryKey: ["admin-users", search],
	});
	const [pending, setPending] = useState<string[]>([]);
	const promote = useMutation({
		mutationFn: (id: string) => fetchWithAuth(`/admin/users/${id}/promote`, { method: "POST" }),
		onError: error => showToast(error.message, "negative"),
		onMutate: id => setPending(current => [...current, id]),
		onSettled: (_data, _error, id) => setPending(current => current.filter(value => value !== id)),
		onSuccess: () => {
			showToast("Permissão administrativa concedida.", "positive");
			void client.invalidateQueries({ queryKey: ["admin-users"] });
		},
	});
	return (
		<section className="grid gap-3 rounded-2xl border p-4">
			<h2 className="font-semibold text-lg">Administradores</h2>
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
						className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
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
