import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LuShieldCheck } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchWithAuth } from "@/lib/dataService";
import { useAuthStore } from "@/stores/auth";

export function AdminPageLayout({
	children,
	description,
	title,
	root = false,
}: {
	children: ReactNode;
	description: string;
	title: string;
	root?: boolean;
}) {
	const authenticated = useAuthStore(state => state.isAuthenticated);
	const userId = useAuthStore(state => state.user?.id);
	const access = useQuery({
		enabled: authenticated,
		queryFn: () => fetchWithAuth<{ role: string }>("/admin/access"),
		queryKey: ["admin-access", userId],
		retry: false,
	});
	return (
		<PageContainer className="max-w-5xl space-y-6">
			<PageBackButton to={root ? "/more" : "/admin"} />
			<PageHeader description={description} title={title} />
			{!authenticated ? (
				<EmptyState
					description="Entre com uma conta administrativa para acessar."
					icon={<LuShieldCheck className="size-6" />}
					title="Acesso administrativo"
				/>
			) : access.isPending ? (
				<div aria-label="Carregando administração" className="grid gap-4 sm:grid-cols-2" role="status">
					{[0, 1, 2, 3].map(item => (
						<Skeleton className="h-36 w-full rounded-2xl" key={item} />
					))}
				</div>
			) : access.isError ? (
				<div className="space-y-4 rounded-2xl border bg-card p-6">
					<p role="alert">{access.error.message}</p>
					<ActionGroup>
						<Button onClick={() => void access.refetch()} variant="outline">
							Tentar novamente
						</Button>
					</ActionGroup>
				</div>
			) : access.data.role !== "ADMIN" ? (
				<EmptyState
					description="Uma conta administrativa é necessária para acessar esta seção."
					icon={<LuShieldCheck className="size-6" />}
					title="Acesso restrito"
				/>
			) : (
				children
			)}
		</PageContainer>
	);
}
