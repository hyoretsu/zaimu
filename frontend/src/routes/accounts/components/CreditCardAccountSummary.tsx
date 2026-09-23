import type { CreditCard } from "@/lib/api";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function CreditCardAccountSummary({ card }: { card?: CreditCard }) {
	if (!card) {
		return <p className="text-muted-foreground text-sm">Dados do cartão indisponíveis.</p>;
	}
	const currentBill = Math.max(0, card.currentStatement?.balanceAmount ?? 0);
	const limit = card.limit;

	return (
		<div className="grid gap-4 min-[420px]:grid-cols-2">
			<div>
				<p className="text-muted-foreground text-xs">Fatura atual</p>
				<p className="mt-1 font-bold text-lg">{currency.format(currentBill)}</p>
			</div>
			<div>
				<p className="text-muted-foreground text-xs">Limite disponível</p>
				<p className="mt-1 font-bold text-lg">{currency.format(limit.availableLimit)}</p>
			</div>
			{limit.temporaryCredit > 0 && (
				<div className="min-[420px]:col-span-2">
					<p className="text-muted-foreground text-xs">Crédito temporário por pagamento excedente</p>
					<p className="mt-1 font-semibold text-sm">+ {currency.format(limit.temporaryCredit)}</p>
				</div>
			)}
			{card.cashbackRate ? (
				<div className="min-[420px]:col-span-2">
					<p className="text-muted-foreground text-xs">Cashback</p>
					<p className="mt-1 font-semibold text-sm">
						{new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(card.cashbackRate)}%
						{card.cashbackYieldReferenceRate
							? ` · rende ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(card.cashbackYieldReferencePercentage ?? 100)}% de ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(card.cashbackYieldReferenceRate)}% ${card.cashbackYieldPeriod === "YEARLY" ? "ao ano" : "ao mês"}`
							: ""}
					</p>
				</div>
			) : null}
		</div>
	);
}
