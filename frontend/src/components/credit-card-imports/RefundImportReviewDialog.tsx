import { useQuery } from "@tanstack/react-query";
import { creditBookPlan } from "@zaimu/finance/credit-book";
import { installmentOccurrenceDate, purchaseStatementDates } from "@zaimu/finance/credit-purchase";
import { useState } from "react";
import { ImportDialog, ImportDialogContent } from "@/components/imports";
import { TagPicker } from "@/components/tags";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { CreditCardImportItem } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";

export function RefundImportReviewDialog({
	cardId,
	item,
	loadSources,
	onOpenChange,
	onSubmit,
	pending,
	reviewKey,
}: {
	cardId: string;
	item: Pick<
		CreditCardImportItem,
		| "description"
		| "installmentAmount"
		| "purchaseDate"
		| "reconciledCreditPurchaseId"
		| "storeName"
		| "totalAmount"
	>;
	loadSources: () => ReturnType<typeof dataService.creditCardImports.refundSources>;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: Parameters<typeof dataService.creditCardImports.approveRefund>[2]) => Promise<unknown>;
	pending: boolean;
	reviewKey: string;
}) {
	const [mode, setMode] = useState<"link" | "reconstruct">("link");
	const [sourceId, setSourceId] = useState(item.reconciledCreditPurchaseId ?? "");
	const [description, setDescription] = useDebouncedInput(item.description, () => undefined);
	const [storeName, setStoreName] = useDebouncedInput(item.storeName ?? "", () => undefined);
	const [installments, setInstallments] = useDebouncedInput("1", () => undefined);
	const [purchaseDate, setPurchaseDate] = useState(item.purchaseDate.slice(0, 10));
	const [totalAmount, setTotalAmount] = useState(String(Math.abs(item.totalAmount)));
	const [tagIds, setTagIds] = useState<string[]>([]);
	const [policy, setPolicy] = useState<"KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS" | undefined>();
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
	const selected = sources.data?.find(source => source.id === sourceId);
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
		Boolean(original && !book.data?.refunds.some(r => r.purchaseId === original.id));
	const originalTotal = original ? original.totalAmountCents / 100 : reconstructedTotal;
	const creditCycle = book.data
		? purchaseStatementDates(book.data.card, item.purchaseDate.slice(0, 10)).statementDate
		: null;
	const future =
		mode === "link"
			? Boolean(
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
		firstRefund &&
		Math.round(amount * 100) === Math.round(originalTotal * 100) &&
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
			<ImportDialogContent className="max-h-[92dvh] overflow-hidden p-0 sm:max-w-lg">
				<ScrollArea className="max-h-[92dvh]">
					<div className="grid gap-5 p-6">
						<DialogHeader>
							<DialogTitle>Revisar reembolso importado</DialogTitle>
							<DialogDescription>
								{currency.format(amount)} em {item.purchaseDate.slice(0, 10)}. Vincule a compra original ou
								revise os dados para reconstruí-la.
							</DialogDescription>
						</DialogHeader>
						{sources.isPending || book.isPending ? (
							<Skeleton className="h-36 rounded-xl" />
						) : sources.isError || book.isError ? (
							<p className="text-destructive text-sm">Não foi possível carregar as compras do cartão.</p>
						) : (
							<>
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
										<CustomSelect
											label="Compra original"
											onValueChange={setSourceId}
											options={(sources.data ?? []).map(source => ({
												label: `${source.description} - ${source.purchaseDate.slice(0, 10)} - disponível ${currency.format(source.refundableAmount)}`,
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
								{pending ? "Aprovando…" : "Aprovar reembolso"}
							</Button>
						</DialogFooter>
					</div>
				</ScrollArea>
			</ImportDialogContent>
		</ImportDialog>
	);
}
