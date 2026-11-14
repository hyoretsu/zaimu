import { useRouter } from "@tanstack/react-router";
import { compareLoanOffers, type ComparisonRanking } from "@zaimu/finance/loan-comparison";
import type { LoanContractTerms } from "@zaimu/finance/loan-contract";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuEraser, LuLink, LuPlus, LuSmartphone } from "react-icons/lu";
import { z } from "zod";
import { CurrencySelect } from "@/components/currency/CurrencySelect";
import { ToolPageFrame } from "@/components/layout/ToolPageFrame";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { NumericField } from "@/components/ui/NumericField";
import { PageHeader } from "@/components/ui/PageHeader";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useUrlViewState } from "@/hooks/use-url-view-state";
import {
	clearComparisonDraft,
	decodeSharedOffers,
	type EditableOffer,
	encodeSharedOffers,
	type LoanComparisonDraft,
	maxComparisonOffers,
	newLoanOffer,
	newPixCreditOffer,
	readComparisonDraft,
	writeComparisonDraft,
} from "@/lib/loan-comparison-offers";
import { viewString } from "@/lib/view-state";
import { LoanContractEditor } from "@/routes/loans/components/LoanContractEditor";
import { showToast } from "@/stores";
import { formatComparisonRate } from "./comparison-format";
import { existingLoanOffer } from "./existing-loan-offer";
import { ExistingLoanPicker } from "./ExistingLoanPicker";
import { LoanComparisonChart } from "./LoanComparisonChart";
import { LoanComparisonTable } from "./LoanComparisonTable";
import { LoanOfferCard } from "./LoanOfferCard";
import { PixCreditOfferCard } from "./PixCreditOfferCard";
import { useLoanComparisonContext } from "./use-loan-comparison-context";

const rankings = z.enum(["CET", "NET_COST", "TOTAL_PAID"]);
const payoffMonths = z.number().int().min(0).max(600);

function initialDraft(): LoanComparisonDraft {
	return (
		readComparisonDraft() ?? {
			existingLoanIds: [],
			offers: [newLoanOffer("BRL", 1), newPixCreditOffer("BRL", 1)],
			opportunityRate: null,
		}
	);
}

function offerCurrency(offer: EditableOffer | undefined) {
	if (!offer) return "BRL";
	return offer.kind === "LOAN" ? offer.terms.currency : offer.currency;
}

function withCurrency(offer: EditableOffer, currency: string): EditableOffer {
	return offer.kind === "LOAN" ? { ...offer, terms: { ...offer.terms, currency } } : { ...offer, currency };
}

export function LoanComparisonPage() {
	useDocumentTitle("Comparar empréstimos");
	const router = useRouter();
	const [from] = useUrlViewState("from", "", viewString);
	const [loanParameter] = useUrlViewState("loan", "", viewString);
	const [rankBy, setRankBy] = useUrlViewState<ComparisonRanking>("rank", "CET", rankings);
	const [payoffMonth, setPayoffMonth] = useUrlViewState("payoff", 0, payoffMonths);
	const [draft, setDraft] = useState(initialDraft);
	const [creating, setCreating] = useState<LoanContractTerms | null>(null);
	const context = useLoanComparisonContext();
	const currency = offerCurrency(draft.offers[0]);

	useEffect(() => writeComparisonDraft(draft), [draft]);

	// Share links are a one-time import: offers move into the local draft and leave the URL.
	const imported = useRef(false);
	useEffect(() => {
		if (imported.current) return;
		imported.current = true;
		const url = new URL(router.history.location.href, "http://localhost");
		const shared = url.searchParams.get("offers");
		if (!shared) return;
		const offers = decodeSharedOffers(shared);
		url.searchParams.delete("offers");
		router.history.replace(`${url.pathname}${url.search}${url.hash}`);
		if (!offers) {
			showToast("Link de comparação inválido", "negative");
			return;
		}
		setDraft(current => ({ ...current, offers }));
		showToast("Ofertas do link carregadas", "positive");
	}, [router]);

	useEffect(() => {
		if (!loanParameter) return;
		setDraft(current =>
			current.existingLoanIds.includes(loanParameter)
				? current
				: { ...current, existingLoanIds: [...current.existingLoanIds, loanParameter] },
		);
	}, [loanParameter]);

	const existingOffers = useMemo(
		() =>
			context.loans
				.filter(loan => draft.existingLoanIds.includes(loan.id))
				.map(loan => existingLoanOffer(loan, context.today, context.reference))
				.filter(offer => offer !== null),
		[context.loans, context.reference, context.today, draft.existingLoanIds],
	);
	const opportunityMonthlyRate =
		draft.opportunityRate != null ? draft.opportunityRate / 100 : context.projectedCdi;
	const comparison = useMemo(
		() =>
			compareLoanOffers([...draft.offers, ...existingOffers], {
				opportunityMonthlyRate,
				payoffMonth: payoffMonth || null,
				rankBy,
				reference: context.reference,
			}),
		[context.reference, draft.offers, existingOffers, opportunityMonthlyRate, payoffMonth, rankBy],
	);
	const names = Object.fromEntries(
		[...draft.offers, ...existingOffers].map(offer => [offer.id, offer.name]),
	);
	const invalid = comparison.results.filter(row => row.status !== "OK");
	const maxPayoff = Math.max(0, ...comparison.results.map(row => row.installments - 1));

	const update = (offer: EditableOffer) =>
		setDraft(current => ({
			...current,
			offers: current.offers.map(row => (row.id === offer.id ? offer : row)),
		}));
	const remove = (id: string) =>
		setDraft(current => ({ ...current, offers: current.offers.filter(row => row.id !== id) }));
	const append = (offer: EditableOffer) => {
		if (draft.offers.length >= maxComparisonOffers) {
			showToast(`Compare até ${maxComparisonOffers} ofertas por vez`, "info");
			return;
		}
		setDraft(current => ({ ...current, offers: [...current.offers, offer] }));
	};
	const add = (kind: EditableOffer["kind"]) => {
		const count = draft.offers.filter(row => row.kind === kind).length + 1;
		append(kind === "LOAN" ? newLoanOffer(currency, count) : newPixCreditOffer(currency, count));
	};
	const duplicate = (offer: EditableOffer) =>
		append({ ...structuredClone(offer), id: crypto.randomUUID(), name: `${offer.name} (cópia)` });
	const share = async () => {
		const url = new URL("/tools/loan-comparison", window.location.origin);
		url.searchParams.set("offers", encodeSharedOffers(draft.offers));
		try {
			await navigator.clipboard.writeText(url.toString());
			showToast("Link copiado. Empréstimos cadastrados não são incluídos.", "positive");
		} catch {
			showToast("Não foi possível copiar o link", "negative");
		}
	};

	return (
		<ToolPageFrame>
			<PageHeader
				actions={[
					{
						icon: LuPlus,
						label: "Adicionar empréstimo",
						onClick: () => add("LOAN"),
						variant: "outline",
					},
					{
						icon: LuSmartphone,
						label: "Adicionar Pix no crédito",
						onClick: () => add("PIX_CREDIT"),
						variant: "outline",
					},
					{
						disabled: draft.offers.length === 0,
						icon: LuLink,
						label: "Copiar link",
						onClick: () => void share(),
						variant: "outline",
					},
					{
						icon: LuEraser,
						label: "Limpar comparação",
						onClick: () => {
							clearComparisonDraft();
							setDraft({ existingLoanIds: [], offers: [], opportunityRate: null });
						},
						variant: "outline",
					},
				]}
				backTo={from === "loans" ? "/loans" : "/tools"}
				description="Compare taxas, prazos, CET e Pix no crédito lado a lado. Os dados ficam só neste navegador."
				title="Comparar empréstimos"
			/>

			<FormFieldRow>
				<CurrencySelect
					onValueChange={value =>
						setDraft(current => ({
							...current,
							offers: current.offers.map(offer => withCurrency(offer, value)),
						}))
					}
					value={currency}
				/>
				<NumericField
					description={
						draft.opportunityRate != null
							? "Deixe vazio para usar o CDI projetado."
							: context.projectedCdi != null
								? `Usando CDI projetado: ${formatComparisonRate(context.projectedCdi)} ao mês.`
								: "Informe quanto seu dinheiro renderia para calcular o valor presente."
					}
					id="comparison-opportunity-rate"
					label="Rendimento alternativo ao mês"
					onValueChange={value =>
						setDraft(current => ({ ...current, opportunityRate: value ? Number(value) : null }))
					}
					placeholder="Ex: 0,9%"
					suffix="%"
					value={draft.opportunityRate == null ? "" : String(draft.opportunityRate)}
				/>
			</FormFieldRow>

			{context.hasSession && (
				<ExistingLoanPicker
					loans={context.loans}
					onChange={existingLoanIds => setDraft(current => ({ ...current, existingLoanIds }))}
					selected={draft.existingLoanIds}
				/>
			)}

			<div className="grid gap-4 lg:grid-cols-2">
				{draft.offers.map(offer =>
					offer.kind === "LOAN" ? (
						<LoanOfferCard
							key={offer.id}
							offer={offer}
							onChange={update}
							onCreateLoan={context.hasSession ? () => setCreating(offer.terms) : undefined}
							onDuplicate={() => duplicate(offer)}
							onRemove={() => remove(offer.id)}
						/>
					) : (
						<PixCreditOfferCard
							cards={context.cards}
							key={offer.id}
							offer={offer}
							onChange={update}
							onDuplicate={() => duplicate(offer)}
							onRemove={() => remove(offer.id)}
						/>
					),
				)}
			</div>
			{draft.offers.length === 0 && existingOffers.length === 0 && (
				<p className="card text-muted-foreground p-6 text-center">
					Adicione empréstimos ou Pix no crédito pelo menu de ações para comparar.
				</p>
			)}

			{comparison.results.length > 0 && (
				<section aria-labelledby="comparison-results" className="space-y-4">
					<h2 className="text-xl font-semibold" id="comparison-results">
						Resultado
					</h2>
					<FormFieldRow>
						<CustomSelect
							label="Ordenar por"
							onValueChange={value => setRankBy(value as ComparisonRanking)}
							options={[
								{ label: "Menor CET", value: "CET" },
								{ label: "Menor custo a valor presente", value: "NET_COST" },
								{ label: "Menor total pago", value: "TOTAL_PAID" },
							]}
							placeholder="Ex: Menor CET"
							value={rankBy}
						/>
						<NumericField
							decimalScale={0}
							description="Simula quitar o saldo logo após pagar esse número de parcelas."
							id="comparison-payoff-month"
							label="Quitar após parcela"
							onValueChange={value => setPayoffMonth(Math.min(maxPayoff, Number(value || 0)))}
							placeholder="Ex: 6"
							value={payoffMonth ? String(payoffMonth) : ""}
						/>
					</FormFieldRow>
					{comparison.currencyMismatch && (
						<p className="text-destructive text-sm" role="alert">
							Ofertas em moedas diferentes não são comparáveis diretamente.
						</p>
					)}
					{comparison.amountsDiffer && (
						<p className="text-muted-foreground text-sm" role="status">
							Os valores recebidos diferem. CET e custo a valor presente continuam comparáveis;
							o total pago favorece ofertas menores.
						</p>
					)}
					{invalid.length > 0 && (
						<ul className="text-muted-foreground space-y-1 text-sm">
							{invalid.map(row => (
								<li key={row.id}>
									{names[row.id] || "Oferta"}: {row.reason ?? "Dados incompletos"}
								</li>
							))}
						</ul>
					)}
					<LoanComparisonTable
						comparison={comparison}
						names={names}
						payoffMonth={payoffMonth || null}
					/>
					<LoanComparisonChart names={names} results={comparison.results} />
					<p className="text-muted-foreground text-xs">
						Simulação para comparação. CET calculado pela convenção da Resolução CMN 3.517 sobre
						os valores informados; confirme o CET oficial na proposta do credor. Indexadores usam
						projeção dos últimos cinco anos.
					</p>
				</section>
			)}

			{creating && <LoanContractEditor initialTerms={creating} onClose={() => setCreating(null)} />}
		</ToolPageFrame>
	);
}
