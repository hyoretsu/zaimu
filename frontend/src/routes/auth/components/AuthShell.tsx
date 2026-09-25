import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuBadgeCheck, LuChartNoAxesCombined, LuShieldCheck } from "react-icons/lu";
import { BrandMark } from "@/components/BrandMark";

export function AuthShell({
	children,
	description,
	title,
}: {
	children: ReactNode;
	description: string;
	title: string;
}) {
	return (
		<main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(340px,44%)_1fr]">
			<section className="relative hidden overflow-hidden bg-brand-indigo p-12 text-white lg:flex lg:flex-col lg:justify-between">
				<div className="absolute -top-24 -right-20 size-72 rounded-full bg-brand-yellow/20 blur-2xl" />
				<div className="absolute -bottom-32 -left-24 size-80 rounded-full bg-white/10 blur-3xl" />
				<div className="relative w-full max-w-md rounded-3xl bg-white px-7 py-5 shadow-[0_24px_64px_rgba(20,22,80,.3)]">
					<img alt="Zaimu - the app for finances" className="h-auto w-full" src="/brand/zaimu-banner.svg" />
				</div>
				<div className="relative max-w-lg space-y-8">
					<p className="font-semibold text-4xl leading-tight">Contas, cartões e compras em um só lugar.</p>
					<div className="grid gap-4 text-white/85">
						<p className="flex items-center gap-3">
							<LuChartNoAxesCombined className="size-5 text-brand-yellow" /> Visão clara das faturas e limites
						</p>
						<p className="flex items-center gap-3">
							<LuShieldCheck className="size-5 text-brand-yellow" /> Sessão segura e dados isolados
						</p>
						<p className="flex items-center gap-3">
							<LuBadgeCheck className="size-5 text-brand-yellow" /> Funciona no navegador e no aplicativo
						</p>
					</div>
				</div>
				<p className="relative text-sm text-white/55">
					Controle financeiro pessoal, sem planilha complicada.
				</p>
			</section>

			<section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8">
				<div className="w-full max-w-md">
					<div className="mb-10 lg:hidden">
						<BrandMark />
					</div>
					<div className="mb-7">
						<h1 className="font-bold text-3xl tracking-tight">{title}</h1>
						<p className="mt-2 text-muted-foreground leading-relaxed">{description}</p>
					</div>
					{children}
					<footer className="mt-8 flex justify-center gap-4 text-muted-foreground text-xs">
						<Link className="underline-offset-4 hover:text-foreground hover:underline" to="/terms">
							Terms & Conditions
						</Link>
						<Link className="underline-offset-4 hover:text-foreground hover:underline" to="/privacy">
							Privacy Policy
						</Link>
					</footer>
				</div>
			</section>
		</main>
	);
}
