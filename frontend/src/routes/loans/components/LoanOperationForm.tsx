import { useQuery } from "@tanstack/react-query";
import {
	activeLoanVersion,
	type LoanContractBook,
	type LoanSimulation,
	type LoanSimulationInput,
	outstandingLoanSchedule,
} from "@zaimu/finance/loan-contract";
import { useRef, useState } from "react";
import { LuCalculator, LuCheck } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { loanContractService } from "@/lib/loan-contract-service";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { submittedNumber } from "./loan-contract-form";
import { formatCurrency } from "./loan-format";
import { LoanInstallmentRow } from "./LoanInstallmentRow";
import { LoanSection } from "./LoanSection";
export function LoanOperationForm({
	book,
	onChanged,
	initial,
}: {
	book: LoanContractBook;
	onChanged: () => Promise<void>;
	initial?: { input: LoanSimulationInput; accountId: string };
}) {
	const identity = useCacheIdentity();
	const formRef = useRef<HTMLFormElement>(null);
	const { terms } = activeLoanVersion(book);
	const rows = outstandingLoanSchedule(book);
	const [mode, setMode] = useState<LoanSimulationInput["mode"] | "PAYMENT">(
		initial?.input.mode ?? "PAYMENT",
	);
	const [date, setDate] = useState(initial?.input.date ?? getLocalDateKey());
	const [count, setCount] = useState(String(initial?.input.count ?? 1));
	const [amount, setAmount] = useState(initial?.input.amount ? String(initial.input.amount) : "");
	const [quote, setQuote] = useState("");
	const [accountId, setAccountId] = useState(initial?.accountId ?? "");
	const [actual, setActual] = useState("");
	const [selected, setSelected] = useState<string[]>(initial?.input.installmentIds ?? []);
	const [preview, setPreview] = useState<LoanSimulation | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const accounts = useQuery({
		enabled: !!identity,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const account = accounts.data?.find(row => row.id === accountId);
	const invalidate = () => setPreview(null);
	const run = async (execute = false) => {
		if (!formRef.current || pending) return;
		setError("");
		try {
			const form = formRef.current;
			const entered = submittedNumber(form, "operation-amount", Number(amount));
			const quantity = submittedNumber(form, "operation-count", Number(count));
			const quoted = submittedNumber(form, "operation-quote", Number(quote));
			const booking = {
				accountAmount:
					actual !== "" ? submittedNumber(form, "operation-actual", Number(actual)) : null,
				accountId: accountId || null,
				id: crypto.randomUUID(),
			};
			if (accountId && account?.currency !== terms.currency && booking.accountAmount === null)
				throw new Error("Informe débito efetivo na moeda da conta");
			setPending(true);
			if (mode === "PAYMENT") {
				await loanContractService.pay(book.loanId, {
					amount: entered,
					booking,
					date,
					expectedRevision: book.revision,
				});
				await onChanged();
				setAmount("");
				showToast("Pagamento registrado", "positive");
			} else if (execute && preview) {
				await loanContractService.execute(book.loanId, preview, booking);
				setPreview(null);
				await onChanged();
				showToast("Antecipação registrada", "positive");
			} else
				setPreview(
					await loanContractService.simulate(book.loanId, {
						amount: entered > 0 ? entered : undefined,
						count: quantity,
						date,
						installmentIds: selected,
						mode,
						quotedAmount: quoted > 0 ? quoted : undefined,
					}),
				);
		} catch (error) {
			setError(
				error instanceof Error && !/https?:|Request failed/i.test(error.message)
					? error.message
					: "Não foi possível concluir. Atualize o contrato antes de tentar novamente.",
			);
		} finally {
			setPending(false);
		}
	};
	return (
		<form
			className="space-y-4"
			onSubmit={event => {
				event.preventDefault();
				void run();
			}}
			ref={formRef}
		>
			<FormFieldRow>
				<CustomSelect
					label="Operação"
					onValueChange={v => {
						setMode(v as typeof mode);
						invalidate();
					}}
					options={[
						{ label: "Pagamento integral ou parcial", value: "PAYMENT" },
						{ label: "Antecipar primeiras parcelas", value: "FRONT" },
						{ label: "Antecipar últimas parcelas", value: "BACK" },
						{ label: "Escolher parcelas", value: "SELECTED" },
						{
							disabled: terms.amortization === "MANUAL",
							label: "Amortizar reduzindo prazo",
							value: "REDUCE_TERM",
						},
						{
							disabled: terms.amortization === "MANUAL",
							label: "Amortizar reduzindo prestação",
							value: "REDUCE_PAYMENT",
						},
						{ label: "Quitar empréstimo", value: "PAYOFF" },
					]}
					placeholder="Ex: Antecipar últimas"
					value={mode}
				/>
				<DateField
					id="operation-date"
					label="Data"
					name="operation-date"
					onValueChange={v => {
						setDate(v);
						invalidate();
					}}
					required
					value={date}
				/>
			</FormFieldRow>
			{(mode === "PAYMENT" || mode === "REDUCE_TERM" || mode === "REDUCE_PAYMENT") && (
				<MoneyField
					currencyCode={terms.currency}
					id="operation-amount"
					label={mode === "PAYMENT" ? "Valor pago" : "Amortização extra"}
					onValueChange={v => {
						setAmount(v);
						invalidate();
					}}
					required
					value={amount}
				/>
			)}
			{(mode === "FRONT" || mode === "BACK") && (
				<NumericField
					decimalScale={0}
					id="operation-count"
					label="Quantidade de parcelas"
					onValueChange={v => {
						setCount(v);
						invalidate();
					}}
					placeholder="Ex: 3"
					required
					value={count}
				/>
			)}
			{mode === "SELECTED" && (
				<LoanSection
					initiallyOpen
					summary={`${selected.length} selecionadas`}
					title="Parcelas escolhidas"
				>
					{rows.map(row => (
						<LoanInstallmentRow
							currency={terms.currency}
							key={row.id}
							onSelect={checked => {
								setSelected(old =>
									checked ? [...old, row.id] : old.filter(id => id !== row.id),
								);
								invalidate();
							}}
							row={row}
							selected={selected.includes(row.id)}
						/>
					))}
				</LoanSection>
			)}
			{mode !== "PAYMENT" && (
				<MoneyField
					currencyCode={terms.currency}
					id="operation-quote"
					label="Valor confirmado pelo credor"
					onValueChange={v => {
						setQuote(v);
						invalidate();
					}}
					value={quote}
				/>
			)}
			{accounts.isPending ? (
				<Skeleton className="h-20" />
			) : accounts.isError ? (
				<p role="alert">
					Falha ao carregar contas.{" "}
					<Button onClick={() => void accounts.refetch()} type="button" variant="outline">
						Tentar novamente
					</Button>
				</p>
			) : (
				<CustomSelect
					label="Conta de pagamento"
					onValueChange={v => {
						setAccountId(v);
						setActual("");
					}}
					options={[
						{ label: "Sem conta específica", special: true, value: "" },
						...(accounts.data ?? [])
							.filter(row => ["CASH", "CHECKING", "SAVINGS", "INVESTMENT"].includes(row.type))
							.map(row => ({ label: `${row.name} (${row.currency ?? "BRL"})`, value: row.id })),
					]}
					placeholder="Ex: Conta corrente"
					searchable
					value={accountId}
				/>
			)}{" "}
			{account && (
				<MoneyField
					currencyCode={account.currency ?? "BRL"}
					id="operation-actual"
					label="Débito efetivo na conta"
					onValueChange={setActual}
					required={(account.currency ?? "BRL") !== terms.currency}
					value={actual}
				/>
			)}{" "}
			{preview && (
				<div className="bg-muted/30 space-y-2 rounded-xl border p-4">
					<p>
						Desembolso: <strong>{formatCurrency(preview.amount, terms.currency)}</strong>
					</p>
					<p>Economia contratual: {formatCurrency(preview.interestSaved, terms.currency)}</p>
					<p>Saldo previsto após operação: {formatCurrency(preview.afterTotal, terms.currency)}</p>
					<p>Último vencimento: {preview.afterMaturity}</p>
					<p className="text-muted-foreground text-xs">
						Estimativa contratual. Confirme valor efetivo do credor. Planejador compara impacto
						nos saldos e rendimentos.
					</p>
				</div>
			)}
			{error && (
				<p className="text-destructive" role="alert">
					{error}
				</p>
			)}
			{pending && <p role="status">Processando operação...</p>}
			<ActionGroup>
				<Button
					disabled={pending || accounts.isPending || accounts.isError || !rows.length}
					type="submit"
					variant="outline"
				>
					{mode === "PAYMENT" ? <LuCheck /> : <LuCalculator />}
					{mode === "PAYMENT" ? "Registrar pagamento" : "Simular"}
				</Button>
				{preview && (
					<Button
						disabled={pending || !(Number(quote) > 0)}
						onClick={() => void run(true)}
						type="button"
					>
						<LuCheck />
						Registrar antecipação
					</Button>
				)}
			</ActionGroup>
		</form>
	);
}
