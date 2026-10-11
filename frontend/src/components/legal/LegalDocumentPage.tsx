import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { PageHeader } from "@/components/ui/PageHeader";

interface LegalDocumentPageProps {
	content: string;
	title: string;
}

function normalizeMarkdown(text: string) {
	return text.replaceAll("\\*", "*").replaceAll("\\[", "[").replaceAll("\\&", "&");
}

function renderInlineText(text: string): ReactNode {
	const normalizedText = normalizeMarkdown(text);
	const parts = normalizedText.split(/(\[[^\]]+\]\([^)]+\)|[\w.+-]+@[\w-]+\.[\w.-]+)/g);

	return parts.map((part, index) => {
		const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
		if (linkMatch) {
			const [, label, href] = linkMatch;
			return (
				<a
					className="font-medium text-primary underline underline-offset-4 hover:text-primary/75"
					href={href}
					key={`${href}-${index}`}
					rel="noreferrer"
					target="_blank"
				>
					{label}
				</a>
			);
		}

		if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(part)) {
			return (
				<a
					className="font-medium text-primary underline underline-offset-4 hover:text-primary/75"
					href={`mailto:${part}`}
					key={`${part}-${index}`}
				>
					{part}
				</a>
			);
		}

		return part;
	});
}

function LegalDocumentPage({ content, title }: LegalDocumentPageProps) {
	const blocks = content
		.replaceAll("\r", "")
		.split(/\n{2,}/)
		.map(block => block.trim())
		.filter(Boolean);

	return (
		<main className="min-h-dvh bg-background px-5 py-6 sm:px-8 sm:py-10">
			<div className="mx-auto max-w-3xl">
				<header className="mb-8 flex items-center justify-between gap-4">
					<Link aria-label="Ir para entrar" to="/auth">
						<BrandMark />
					</Link>
					<Link
						className="rounded-4xl border border-border px-4 py-2 font-medium text-sm transition-colors hover:bg-muted"
						to="/auth"
					>
						Entrar
					</Link>
				</header>

				<article className="rounded-3xl border border-border/70 bg-card p-6 shadow-card sm:p-10">
					<PageHeader className="mb-8" title={title} />
					<div className="space-y-6 text-[0.95rem] text-foreground/85 leading-7 sm:text-base">
						{blocks.map((block, index) => {
							const normalizedBlock = normalizeMarkdown(block);
							const heading = normalizedBlock.match(/^\*\*(.+)\*\*$/);
							const listItems = normalizedBlock
								.split("\n")
								.filter(line => line.startsWith("*   "))
								.map(line => line.slice(4));

							if (heading) {
								return (
									<h2 className="pt-3 font-semibold text-foreground text-xl" key={heading[1]}>
										{heading[1]}
									</h2>
								);
							}

							if (listItems.length > 0) {
								return (
									<ul className="list-disc space-y-2 pl-6 marker:text-primary" key={`list-${index}`}>
										{listItems.map(item => (
											<li key={item}>{renderInlineText(item)}</li>
										))}
									</ul>
								);
							}

							return (
								<p key={`paragraph-${index}`}>{renderInlineText(normalizedBlock.replaceAll("\n", " "))}</p>
							);
						})}
					</div>
				</article>
			</div>
		</main>
	);
}

export { LegalDocumentPage };
