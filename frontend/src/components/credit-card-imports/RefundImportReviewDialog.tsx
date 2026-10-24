import { useQuery } from "@tanstack/react-query";
import { creditBookPlan } from "@zaimu/finance/credit-book";
import {
	distributePurchaseCents,
	installmentOccurrenceDate,
	purchaseStatementDates,
} from "@zaimu/finance/credit-purchase";
import { importedAnticipation, withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { currencyScale } from "@zaimu/finance/money";
import { useState } from "react";
import { ImportDialog, ImportDialogContent } from "@/components/imports";
import { TagPicker } from "@/components/tags";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import {
	DialogBody,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { CreditCardImportItem } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";

import { eligibleRefundSources, matchingRefundSource } from "./refund-source-match";

export function RefundImportReviewDialog({
	action = "approve",
	cardId,
	initialData,
	item,
	loadSources,
	onOpenChange,
	onSubmit,
	pending,
	reviewKey,
}: {
	action?: "save" | "approve";
	cardId: string;
	initialData?: Parameters<typeof dataService.creditCardImports.approveRefund>[2];
	item: Pick<
		CreditCardImportItem,
		| "description"
		| "installmentAmount"
		| "purchaseDate"
		| "reconciledCreditPurchaseId"
		| "storeName"
		| "totalAmount"
	> & { installments?: number };
	loadSources: () => ReturnType<typeof dataService.creditCardImports.refundSources>;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: Parameters<typeof dataService.creditCardImports.approveRefund>[2]) => Promise<unknown>;
	pending: boolean;
	reviewKey: string;
}) {
	const cancellation = importedAnticipation(item.description);
	const [mode, setMode] = useState<"link" | "reconstruct">(initialData?.purchase ? "reconstruct" : "link");
	const [chosenSourceId, setSourceId] = useState(
		initialData?.purchaseId ?? item.reconciledCreditPurchaseId ?? "",
	);
	const [description, setDescription] = useDebouncedInput(
		initialData?.purchase?.description ?? withoutImportedAnticipation(item.description),
		() => undefined,
	);
	const [storeName, setStoreName] = useDebouncedInput(
		initialData?.purchase?.storeName ?? item.storeName ?? "",
		() => undefined,
	);
	const [installments, setInstallments] = useDebouncedInput(
		String(
			initialData?.purchase?.installments ??
				(cancellation ? (item.installments ?? Math.max(...cancellation.map(part => part.number))) : 1),
		),
		() => undefined,
	);
	const [purchaseDate, setPurchaseDate] = useState(
		initialData?.purchase?.purchaseDate ?? item.purchaseDate.slice(0, 10),
	);
	const [totalAmount, setTotalAmount] = useState(
		String(initialData?.purchase?.totalAmount ?? Math.abs(item.totalAmount)),
	);
	const [tagIds, setTagIds] = useState<string[]>(initialData?.purchase?.tagIds ?? []);
	const [policy, setPolicy] = useState<"KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS" | undefined>(
		initialData?.policy,
	);
	const identity = useCacheIdentity();
	const sources = useQuery({
		enabled: Boolean(identity),
		queryFn: loadSources,
		queryKey: ["identity", identity, "refund-sources", reviewKey],
	});
	const book = useQuery({
		enabled: Boolean(identity),
		queryFn: () => dataService.creditCards.getBook(cardId),
		queryKey: queryKeys.creditCards.book(identity!, cardId),
	});
	const eligibleSources = eligibleRefundSources(
		item,
		(sources.data ?? []).map(source => ({
			...source,
			installmentAmountsCents:
				book.data?.purchases.find(purchase => purchase.id === source.id)?.installmentAmountsCents ??
				(book.data
					? distributePurchaseCents(
							Math.round(source.totalAmount * currencyScale(book.data.card.currency)),
							source.installments,
							new Map(),
							book.data.card.installmentRemainderOnFirst,
						)
					: undefined),
		})),
	);
	const suggested = matchingRefundSource(item, eligibleSources);
	const sourceId = eligibleSources.some(source => source.id === chosenSourceId)
		? chosenSourceId
		: suggested?.id || "";
	const selected = eligibleSources.find(source => source.id === sourceId);
	const amount = Math.abs(item.installmentAmount);
	const reconstructedTotal = Number(totalAmount);
	const count = Number.parseInt(installments, 10);
	const canSubmit =
		mode === "link"
			? Boolean(selected && selected.refundableAmount >= amount)
			: Boolean(
					description.trim() &&
						purchaseDate &&
						reconstructedTotal >= amount &&
						Number.isInteger(count) &&
						count >= 1 &&
						count <= 48,
				);
	const currencyCode = book.data?.card.currency ?? "BRL";
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	const original = mode === "link" ? book.data?.purchases.find(p => p.id === sourceId) : undefined;
	const firstRefund =
		mode === "reconstruct" ||
		Boolean(
			sourceId.startsWith("pending:") ||
				(original && !book.data?.refunds.some(r => r.purchaseId === original.id)),
		);
	const originalTotal = original
		? original.totalAmountCents / currencyScale(currencyCode)
		: (selected?.totalAmount ?? reconstructedTotal);
	const creditCycle = book.data
		? purchaseStatementDates(book.data.card, item.purchaseDate.slice(0, 10)).statementDate
		: null;
	const future =
		mode === "link"
			? sourceId.startsWith("pending:")
				? Boolean(
						selected &&
							selected.installments > 1 &&
							book.data &&
							purchaseStatementDates(
								book.data.card,
								installmentOccurrenceDate(selected.purchaseDate, selected.installments),
							).statementDate > creditCycle!,
					)
				: Boolean(
						book.data &&
							creditBookPlan(book.data).installments.some(
								i =>
									i.purchaseId === sourceId &&
									!i.isSettled &&
									creditBookPlan(book.data!).statements.find(s => s.id === i.statementId)!.statementDate >
										creditCycle!,
							),
					)
			: Boolean(
					book.data &&
						count > 1 &&
						purchaseStatementDates(book.data.card, installmentOccurrenceDate(purchaseDate, count))
							.statementDate > creditCycle!,
				);
	const needsPolicy =
		!cancellation &&
		firstRefund &&
		Math.round(amount * currencyScale(currencyCode)) ===
			Math.round(originalTotal * currencyScale(currencyCode)) &&
		future &&
		!book.data?.card.refundPolicy;
	const submit = async () => {
		await onSubmit({
			...(mode === "link"
				? { purchaseId: sourceId }
				: {
						purchase: {
							description: description.trim(),
							installments: count,
							purchaseDate,
							storeName: storeName.trim() || undefined,
							tagIds,
							totalAmount: reconstructedTotal,
						},
					}),
			...(policy && { policy }),
		});
	};
	return (
		<ImportDialog onOpenChange={onOpenChange} open>
			<ImportDialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Revisar reembolso importado</DialogTitle>
					<DialogDescription>
						{currency.format(amount)} em {item.purchaseDate.slice(0, 10)}. Vincule a compra original ou revise
						os dados para reconstruí-la.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					{sources.isPending || book.isPending ? (
						<Skeleton className="h-36 rounded-xl" />
					) : sources.isError || book.isError ? (
						<p className="text-destructive text-sm">Não foi possível carregar as compras do cartão.</p>
					) : (
						<>
							{cancellation ? (
								<p className="text-muted-foreground text-sm">
									Este reembolso cancela {cancellation.length} parcelas da compra. O crédito compensa a
									antecipação; somente o excedente entra como crédito na fatura.
								</p>
							) : null}
							<CustomSelect
								label="Origem do reembolso"
								onValueChange={value => setMode(value as typeof mode)}
								options={[
									{ label: "Vincular compra existente", value: "link" },
									{ label: "Reconstruir compra original", value: "reconstruct" },
								]}
								placeholder="Selecione"
								value={mode}
							/>
							{mode === "link" ? (
								<>
									{suggested && !chosenSourceId ? (
										<p className="text-muted-foreground text-sm">
											Compra selecionada automaticamente. Confira ou escolha outra compra.
										</p>
									) : null}
									<CustomSelect
										label="Compra original"
										onValueChange={setSourceId}
										options={eligibleSources.map(source => ({
											label: `${source.description.trim() || "Compra sem nome"} - ${source.purchaseDate.slice(0, 10)} - ${source.installments}x - ${currency.format(source.totalAmount)}`,
											value: source.id,
										}))}
										placeholder="Busque a compra original"
										required
										searchable
										value={sourceId}
									/>
									{selected && selected.refundableAmount < amount ? (
										<p className="text-destructive text-sm">Reembolso excede saldo disponível da compra.</p>
									) : null}
								</>
							) : (
								<div className="grid gap-4">
									<FormField
										autoComplete="off"
										id="refund-original-description"
										label="Descrição original"
										name="refund-original-description"
										onChange={event => setDescription(event.currentTarget.value)}
										placeholder="Ex: Compra no mercado"
										required
										type="text"
										value={description}
									/>
									<FormField
										autoComplete="off"
										id="refund-original-store"
										label="Estabelecimento"
										name="refund-original-store"
										onChange={event => setStoreName(event.currentTarget.value)}
										placeholder="Ex: Mercado Central"
										type="text"
										value={storeName}
									/>
									<MoneyField
										currencyCode={currencyCode}
										id="refund-original-total"
										label="Valor total da compra original"
										onValueChange={setTotalAmount}
										placeholder="R$ 300,00"
										required
										value={totalAmount}
									/>
									<DateField
										autoComplete="off"
										id="refund-original-date"
										label="Data da compra original"
										name="refund-original-date"
										onValueChange={setPurchaseDate}
										required
										value={purchaseDate}
									/>
									<TagPicker onValueChange={setTagIds} value={tagIds} />
									<FormField
										autoComplete="off"
										id="refund-original-installments"
										inputMode="numeric"
										label="Total de parcelas"
										name="refund-original-installments"
										onChange={event =>
											setInstallments(event.currentTarget.value.replace(/\D/g, "").slice(0, 2))
										}
										placeholder="Ex: 3"
										required
										type="text"
										value={installments}
									/>
								</div>
							)}
							{book.data?.card.refundPolicy ? (
								<p className="text-muted-foreground text-sm">
									Política da instituição:{" "}
									{book.data.card.refundPolicy === "KEEP_INSTALLMENTS"
										? "manter parcelas"
										: "cancelar parcelas futuras"}
									.
								</p>
							) : needsPolicy ? (
								<CustomSelect
									label="Parcelas futuras"
									onValueChange={value => setPolicy(value as typeof policy)}
									options={[
										{ label: "Manter parcelas e creditar tudo", value: "KEEP_INSTALLMENTS" },
										{
											label: "Cancelar parcelas futuras e creditar a diferença",
											value: "CANCEL_FUTURE_INSTALLMENTS",
										},
									]}
									placeholder="Selecione quando necessário"
									required
									value={policy}
								/>
							) : null}
						</>
					)}
				</DialogBody>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} type="button" variant="outline">
						Descartar
					</Button>
					<Button
						disabled={
							!canSubmit ||
							(needsPolicy && !policy) ||
							pending ||
							sources.isPending ||
							book.isPending ||
							sources.isError ||
							book.isError
						}
						onClick={() => void submit().catch(() => undefined)}
						type="button"
					>
						{action === "save"
							? pending
								? "Salvando..."
								: "Salvar"
							: pending
								? "Aprovando..."
								: "Aprovar reembolso"}
					</Button>
				</DialogFooter>
			</ImportDialogContent>
		</ImportDialog>
	);
}
