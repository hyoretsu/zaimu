import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchWithAuth } from "@/lib/dataService";
import { useAuthStore } from "@/stores/auth";
import { AdminUsers } from "./AdminUsers";
import { TaxCatalogAdmin } from "./TaxCatalogAdmin";
export function AdminPage() {
	const authenticated = useAuthStore(state => state.isAuthenticated);
	const userId = useAuthStore(state => state.user?.id);
	const access = useQuery({
		enabled: authenticated,
		queryFn: () => fetchWithAuth<{ role: string }>("/admin/access"),
		queryKey: ["admin-access", userId],
		retry: false,
	});
	if (!authenticated) return <p>Entre com uma conta administrativa para acessar.</p>;
	if (access.isPending)
		return (
			<div className="grid gap-4">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	if (access.isError)
		return (
			<div>
				<p role="alert">{access.error.message}</p>
				<Button onClick={() => void access.refetch()} variant="outline">
					Tentar novamente
				</Button>
			</div>
		);
	if (access.data.role !== "ADMIN") return <p>Acesso administrativo necessário.</p>;
	return (
		<div className="mx-auto grid w-full max-w-5xl gap-6 p-4">
			<h1 className="font-bold text-2xl">Administração</h1>
			<Link className="cursor-pointer rounded-xl border p-4 font-medium" to="/admin/yield-calendar">
				Moedas, países e feriados
			</Link>
			<TaxCatalogAdmin />
			<AdminUsers />
		</div>
	);
}
