import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LuLogOut } from "react-icons/lu";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores";
import { primaryNavigation, utilityNavigation } from "./navigation";

const active = (pathname: string, to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

export function AppSidebar() {
	const pathname = useLocation().pathname;
	const navigate = useNavigate();
	const { isGuestMode, logout, user } = useAuthStore();

	const signOut = async () => {
		await logout();
		toast.info("Sessão encerrada.");
		await navigate({ to: "/auth" });
	};

	return (
		<aside className="border-border/70 bg-card/95 fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r p-4 backdrop-blur-xl lg:flex">
			<div className="px-2 py-4">
				<BrandMark />
			</div>
			<nav aria-label="Navegação principal" className="mt-5 grid gap-1">
				{primaryNavigation.map(item => (
					<Link
						className={
							active(pathname, item.to)
								? "border-primary/15 bg-primary text-primary-foreground shadow-soft flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold"
								: "text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium"
						}
						key={item.to}
						to={item.to}
					>
						<item.icon className="size-5" />
						{item.label}
					</Link>
				))}
			</nav>
			<div className="mt-auto grid gap-2">
				{utilityNavigation.map(item => (
					<Link
						className="border-border hover:bg-muted flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium"
						key={item.to}
						to={item.to}
					>
						<item.icon className="size-5" />
						{item.label}
					</Link>
				))}
				<div className="border-border bg-muted/45 mt-2 rounded-2xl border p-3">
					<p className="truncate text-sm font-semibold">
						{isGuestMode ? "Modo convidado" : user?.name}
					</p>
					<p className="text-muted-foreground truncate text-xs">
						{isGuestMode ? "Dados salvos neste dispositivo" : user?.email}
					</p>
				</div>
				{!isGuestMode && (
					<Button className="w-full justify-start" onClick={signOut} variant="outline">
						<LuLogOut /> Sair
					</Button>
				)}
			</div>
		</aside>
	);
}
