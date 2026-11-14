import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export function PublicPageLayout({
	children,
	maxWidth = "max-w-3xl",
}: {
	children: ReactNode;
	maxWidth?: string;
}) {
	return (
		<main className="bg-background min-h-dvh px-5 py-6 sm:px-8 sm:py-10">
			<div className={cn("mx-auto", maxWidth)}>
				<header className="mb-8 flex flex-wrap items-center justify-between gap-4">
					<Link aria-label="Ir para entrar" to="/auth">
						<BrandMark />
					</Link>
					<div className="flex flex-wrap gap-2">
						<Button asChild variant="outline">
							<Link to="/auth">Entrar</Link>
						</Button>
						<Button asChild>
							<Link to="/auth/register">Criar conta</Link>
						</Button>
					</div>
				</header>

				{children}

				<footer className="text-muted-foreground mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
					<Link className="hover:text-foreground" to="/privacy">
						Política de Privacidade
					</Link>
					<Link className="hover:text-foreground" to="/terms">
						Termos de Uso
					</Link>
				</footer>
			</div>
		</main>
	);
}
