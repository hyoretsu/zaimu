import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuFileUp } from "react-icons/lu";
import { StatementFilePicker } from "@/components/transaction-imports";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import type { CreditCard, CreditCardImport } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { showToast } from "@/stores";

const providerOptions = [{ label: "Mercado Pago", value: "MERCADO_PAGO" }] as const satisfies ReadonlyArray<{
	label: string;
	value: CreditCardImport["provider"];
}>;

export function ImportCreditCardStatementDialog({
	cards,
	onImported,
	onOpenChange,
	open,
}: {
	cards: CreditCard[];
	onImported: (importId: string) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const [creditCardId, setCreditCardId] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [provider, setProvider] = useState<CreditCardImport["provider"] | "">("");
	useEffect(() => {
		if (!open) return;
		setCreditCardId(cards.length === 1 ? cards[0]!.id : "");
		setFile(null);
		setProvider("");
	}, [cards, open]);
	const createImport = useMutation({
		mutationFn: () => {
			if (!provider) throw new Error("Selecione a instituição da fatura.");
			if (!creditCardId) throw new Error("Selecione o cartão que receberá as compras.");
			if (!file) throw new Error("Selecione uma fatura em PDF.");
			return dataService.creditCardImports.create({
				creditCardId,
				file,
				provider,
			});
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: result => {
			if (!result.creditCardImport) {
				showToast("Nenhuma compra nova encontrada na fatura.", "info");
				onOpenChange(false);
				return;
			}
			onOpenChange(false);
			onImported(result.creditCardImport.id);
			showToast(
				result.ignoredCount
					? `${result.ignoredCount} ${result.ignoredCount === 1 ? "compra já importada foi ignorada" : "compras já importadas foram ignoradas"}.`
					: "Fatura importada para revisão.",
				"positive",
			);
		},
	});

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Importar fatura</DialogTitle>
					<DialogDescription>
						Selecione a instituição da fatura e revise as compras antes de aprovar.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<CustomSelect
						label="Instituição"
						onValueChange={value => setProvider(value as CreditCardImport["provider"])}
						options={providerOptions.map(option => ({ ...option }))}
						placeholder="Selecione a instituição"
						required
						sortOptions={false}
						value={provider}
					/>
					<CustomSelect
						label="Cartão que receberá as compras"
						onValueChange={setCreditCardId}
						options={cards.map(card => ({ label: getCreditCardDisplayName(card), value: card.id }))}
						placeholder="Selecione o cartão"
						required
						value={creditCardId}
					/>
					<StatementFilePicker
						file={file}
						inputId="credit-card-import-file"
						label="Fatura em PDF"
						onFileChange={setFile}
					/>
				</div>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={!provider || !creditCardId || !file || createImport.isPending}
						onClick={() => createImport.mutate()}
					>
						<LuFileUp /> {createImport.isPending ? "Importando…" : "Importar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
