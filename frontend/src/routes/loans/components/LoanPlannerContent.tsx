import { useQuery, useQueryClient } from "@tanstack/react-query";
import { activeLoanVersion, outstandingLoanSchedule } from "@zaimu/finance/loan-contract";
import {
	eligiblePlannerAccounts,
	loanPlannerHorizon,
	type PlannerInput,
	type PlannerOperation,
	type PlannerResult,
	type PlannerScenario,
	type PlannerTransfer,
} from "@zaimu/finance/loan-planner";
import type { LoanPlannerSnapshot } from "@zaimu/finance/loan-planner-runtime";
import { useState } from "react";
import { LuCalculator, LuSave, LuTrash2, LuX } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { useLoanPlanner } from "@/hooks/use-loan-planner";
import type { SavedLoanScenario } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { loanPlannerService } from "@/lib/loan-planner-service";
import { type SavedLoanPlannerParameters, savedLoanPlannerParameters } from "@/lib/loan-planner-settings";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { formatCurrency } from "./loan-format";
import { LoanContractDialog } from "./LoanContractDialog";
import { LoanPlannerAccountRow } from "./LoanPlannerAccountRow";
import { LoanPlannerHorizonNotice } from "./LoanPlannerHorizonNotice";
import { LoanPlannerManualScenario } from "./LoanPlannerManualScenario";
import { LoanPlannerResults } from "./LoanPlannerResults";
import { LoanSection } from "./LoanSection";
export function LoanPlannerContent({ snapshot }: { snapshot: LoanPlannerSnapshot }) {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const worker = useLoanPlanner();
	const [input, setInput] = useState<PlannerInput>(() => ({
		...structuredClone(snapshot.input),
		eligibleLoanIds: snapshot.input.loans
			.filter(row => outstandingLoanSchedule(row.book).length)
			.map(row => row.book.loanId),
	}));
	const [accountId, setAccountId] = useState(
		input.accounts.find(row => ["CHECKING", "CASH"].includes(row.type))?.id ?? "",
	);
	const [budget, setBudget] = useState("");
	const [operations, setOperations] = useState<PlannerScenario["operations"]>([]);
	const [transfers, setTransfers] = useState<PlannerTransfer[]>([]);
	const [selectedId, setSelectedId] = useState("");
	const [saving, setSaving] = useState(false);
	const [restored, setRestored] = useState<SavedLoanScenario | null>(null);
	const [stale, setStale] = useState(false);
	const [review, setReview] = useState<PlannerOperation | null>(null);
	const accounts = useQuery({
		enabled: !!identity,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const loans = useQuery({
		enabled: !!identity,
		queryFn: () => dataService.loans.getAll(),
		queryKey: queryKeys.loans.list(identity!),
	});
	const saved = useQuery({
		enabled: !!identity,
		queryFn: () => loanPlannerService.scenarios(),
		queryKey: [...queryKeys.loans.all(identity!), "scenarios"],
	});
	const names = Object.fromEntries((accounts.data ?? []).map(row => [row.id, row.name ?? "Conta"]));
	const loanNames = Object.fromEntries((loans.data ?? []).map(row => [row.id, row.lender]));
	const eligible = eligiblePlannerAccounts(input.accounts, input.eligibility);
	const edit = (next: PlannerInput) => {
		setInput(next);
		setStale(true);
	};
	const run = (
		scenario?: PlannerScenario,
		nextInput = input,
		nextBudget = Number(budget),
		payer = accountId,
	) => {
		setSelectedId("");
		setStale(false);
		worker.run({
			accountId: payer,
			budget: nextBudget,
			scenario,
			snapshot: { ...snapshot, input: nextInput },
		});
	};
	const selected = worker.result?.ranked.find(row => row.id === selectedId) ?? worker.result?.ranked[0];
	const restore = (row: SavedLoanScenario) => {
		const parsed = savedLoanPlannerParameters.safeParse(row.parameters);
		if (!parsed.success) {
			showToast("Cenário salvo incompatível", "negative");
			return;
		}
		const value = parsed.data;
		const fresh: PlannerInput = {
			...structuredClone(snapshot.input),
			accounts: snapshot.input.accounts.map(account => ({
				...account,
				...value.liquidity[account.id],
			})),
			eligibility: value.eligibility,
			eligibleLoanIds: value.selectedLoanIds ?? value.loans.map(row => row.loanId),
			loans: snapshot.input.loans.map(loan => ({
				...loan,
				paymentAccountId:
					value.loans.find(row => row.loanId === loan.book.loanId)?.paymentAccountId ??
					loan.paymentAccountId,
			})),
			reserve: value.reserve,
		};
		if (value.currency !== snapshot.input.currency) {
			showToast("Moeda do cenário difere da preferência atual", "negative");
			return;
		}
		setInput(fresh);
		setAccountId(value.accountId);
		setBudget(String(value.budget));
		setOperations(value.scenario.operations);
		setTransfers(value.scenario.transfers);
		setRestored(row);
		run(value.scenario, fresh, value.budget, value.accountId);
	};
	const save = async (result: PlannerResult) => {
		setSaving(true);
		try {
			const parameters: SavedLoanPlannerParameters = {
				accountId,
				budget: Number(budget) || 0,
				currency: input.currency,
				eligibility: input.eligibility,
				liquidity: Object.fromEntries(
					input.accounts.map(row => [
						row.id,
						{
							availableFrom: row.availableFrom,
							redemptionCost: row.redemptionCost,
							redemptionDays: row.redemptionDays,
						},
					]),
				),
				loans: input.loans.map(row => ({
					loanId: row.book.loanId,
					paymentAccountId: row.paymentAccountId,
				})),
				reserve: input.reserve,
				scenario: result.scenario,
				selectedLoanIds: input.eligibleLoanIds,
				version: 1,
			};
			await loanPlannerService.save({
				id: crypto.randomUUID(),
				name: result.name.slice(0, 150),
				parameters,
				summary: {
					advantage: result.advantage,
					capturedAt: snapshot.capturedAt,
					status: result.status,
					terminalWealth: result.terminalWealth,
					through: result.through,
				},
			});
			await saved.refetch();
			showToast("Cenário salvo", "positive");
		} catch {
			showToast("Falha ao salvar cenário", "negative");
		} finally {
			setSaving(false);
		}
	};
	return (
		<div className="min-w-0 space-y-4">
			<p>
				Horizonte: {input.from} até {loanPlannerHorizon(input)}. Hipóteses dos indicadores: últimos
				cinco anos, janela fixa.
			</p>
			<LoanPlannerHorizonNotice input={input} names={loanNames} />
			<LoanSection
				initiallyOpen
				summary={`${input.eligibleLoanIds?.length ?? input.loans.length} empréstimos para antecipar; demais obrigações preservadas`}
				title="Empréstimos comparados"
			>
				{snapshot.input.loans.map(loan => (
					<div className="space-y-2 rounded-xl border p-3" key={loan.book.loanId}>
						<CheckboxField
							checkboxProps={{
								checked: input.eligibleLoanIds?.includes(loan.book.loanId) ?? true,
								onCheckedChange: c =>
									edit({
										...input,
										eligibleLoanIds:
											c === true
												? [
														...new Set([
															...(input.eligibleLoanIds ?? []),
															loan.book.loanId,
														]),
													]
												: (input.eligibleLoanIds ?? []).filter(
														id => id !== loan.book.loanId,
													),
									}),
							}}
						>
							{loanNames[loan.book.loanId] ?? "Empréstimo"} -{" "}
							{activeLoanVersion(loan.book).terms.amortization}
						</CheckboxField>
						{input.loans.some(row => row.book.loanId === loan.book.loanId) && (
							<CustomSelect
								label="Conta das parcelas regulares"
								onValueChange={v =>
									edit({
										...input,
										loans: input.loans.map(row =>
											row.book.loanId === loan.book.loanId
												? { ...row, paymentAccountId: v }
												: row,
										),
									})
								}
								options={input.accounts.map(row => ({
									label: names[row.id] ?? "Conta",
									value: row.id,
								}))}
								placeholder="Ex: Conta corrente"
								required
								searchable
								value={
									input.loans.find(row => row.book.loanId === loan.book.loanId)!
										.paymentAccountId
								}
							/>
						)}
					</div>
				))}
			</LoanSection>
			<LoanSection
				summary="Investimentos excluídos por padrão; exclusão específica prevalece"
				title="Contas e liquidez"
			>
				<CheckboxField
					checkboxProps={{
						checked: input.eligibility.allAccounts,
						onCheckedChange: c =>
							edit({
								...input,
								eligibility: { ...input.eligibility, allAccounts: c === true },
							}),
					}}
				>
					Considerar todas as contas elegíveis
				</CheckboxField>
				<CheckboxField
					checkboxProps={{
						checked: input.eligibility.includeInvestments,
						onCheckedChange: c =>
							edit({
								...input,
								eligibility: { ...input.eligibility, includeInvestments: c === true },
							}),
					}}
				>
					Incluir investimentos, inclusive poupanças
				</CheckboxField>
				{input.accounts.map(row => (
					<LoanPlannerAccountRow
						account={row}
						from={input.from}
						key={row.id}
						name={names[row.id] ?? "Conta"}
						onAccount={account =>
							edit({
								...input,
								accounts: input.accounts.map(old => (old.id === account.id ? account : old)),
							})
						}
						onRule={rule => edit({ ...input, eligibility: rule })}
						rule={input.eligibility}
					/>
				))}
			</LoanSection>
			<FormFieldRow>
				<MoneyField
					currencyCode={input.currency}
					id="planner-budget"
					label="Orçamento máximo para antecipação"
					onValueChange={v => {
						setBudget(v);
						setStale(true);
					}}
					required
					value={budget}
				/>
				<MoneyField
					currencyCode={input.currency}
					id="planner-reserve"
					label="Reserva mínima diária"
					onValueChange={v => edit({ ...input, reserve: Number(v) })}
					value={String(input.reserve)}
				/>
				<CustomSelect
					label="Conta que pagará antecipações"
					onValueChange={v => {
						setAccountId(v);
						setStale(true);
					}}
					options={input.accounts
						.filter(row => eligible.has(row.id))
						.map(row => ({ label: names[row.id] ?? "Conta", value: row.id }))}
					placeholder="Ex: Conta corrente"
					required
					searchable
					value={accountId}
				/>
			</FormFieldRow>
			<p className="text-muted-foreground text-xs">
				Busca automática usa conta pagadora escolhida. Resgates e transferências entram apenas nos
				cenários manuais explícitos.
			</p>
			<ActionGroup>
				<Button
					disabled={
						worker.pending ||
						!input.eligibleLoanIds?.length ||
						!eligible.has(accountId) ||
						!(Number(budget) > 0)
					}
					onClick={() => run()}
					variant="outline"
				>
					<LuCalculator />
					Buscar melhores antecipações
				</Button>
				{worker.pending && (
					<Button
						onClick={() => {
							worker.cancel();
							showToast("Busca cancelada", "info");
						}}
						variant="outline"
					>
						<LuX />
						Cancelar busca
					</Button>
				)}
			</ActionGroup>
			{worker.pending && (
				<p role="status">
					Calculando {worker.progress?.done ?? 0} de {worker.progress?.total ?? "..."} cenários...
				</p>
			)}
			{worker.error && <p role="alert">{worker.error}</p>}
			<LoanPlannerManualScenario
				accountId={accountId}
				input={input}
				loanNames={loanNames}
				names={names}
				onOperations={rows => {
					setOperations(rows);
					setStale(true);
				}}
				onRun={scenario => run(scenario)}
				onTransfers={rows => {
					setTransfers(rows);
					setStale(true);
				}}
				operations={operations}
				pending={worker.pending}
				transfers={transfers}
			/>
			{stale && worker.result && (
				<p role="status">Parâmetros alterados. Recalcule antes de salvar ou usar resultados.</p>
			)}
			{restored && (
				<p role="status">
					Cenário salvo reaberto e recalculado com dados atuais. Resumo anterior:{" "}
					{typeof restored.summary === "object" &&
					restored.summary &&
					"terminalWealth" in restored.summary
						? formatCurrency(Number(restored.summary.terminalWealth), input.currency)
						: "Indisponível"}
					.
				</p>
			)}
			{worker.result && (
				<>
					<p>
						{worker.result.evaluated} cenários avaliados em {worker.result.dates.length} datas.
					</p>
					<LoanPlannerResults
						accounts={input.accounts}
						baseline={worker.result.baseline}
						currency={input.currency}
						names={names}
						onSelect={row => setSelectedId(row.id)}
						ranked={worker.result.ranked}
						selectedId={selectedId}
					/>
					{selected && (
						<ActionGroup>
							<Button
								disabled={saving || stale}
								onClick={() => void save(selected)}
								variant="outline"
							>
								<LuSave />
								Salvar cenário selecionado
							</Button>
							{selected.scenario.operations.map((operation, index) => (
								<Button
									disabled={stale}
									key={index}
									onClick={() => setReview(operation)}
									variant="outline"
								>
									<LuCalculator />
									Revisar operação {index + 1} no contrato
								</Button>
							))}
						</ActionGroup>
					)}
				</>
			)}
			<LoanSection summary={`${saved.data?.length ?? 0} cenários`} title="Cenários salvos">
				{saved.isPending ? (
					<p role="status">Carregando cenários...</p>
				) : saved.isError ? (
					<p role="alert">Falha ao carregar cenários</p>
				) : (
					saved.data?.map(row => (
						<div
							className="flex flex-wrap justify-between gap-2 rounded-xl border p-3"
							key={row.id}
						>
							<Button disabled={worker.pending} onClick={() => restore(row)} variant="outline">
								<LuCalculator />
								{row.name} - recalcular
							</Button>
							<ConfirmActionButton
								confirmation="Excluir cenário permanentemente?"
								onConfirm={async () => {
									try {
										await loanPlannerService.remove(row.id);
										await client.invalidateQueries({
											queryKey: [...queryKeys.loans.all(identity!), "scenarios"],
										});
										showToast("Cenário excluído", "positive");
									} catch {
										showToast("Falha ao excluir cenário", "negative");
									}
								}}
								variant="outline"
							>
								<LuTrash2 />
								Excluir
							</ConfirmActionButton>
						</div>
					))
				)}
			</LoanSection>
			<LoanSection
				summary="Média geométrica de cinco anos; receitas e despesas conforme agendas"
				title="Hipóteses financeiras"
			>
				{snapshot.projections.map(row => (
					<p key={row.indicator}>
						{row.indicator}:{" "}
						{row.periodRate === null
							? "Indisponível"
							: `${row.periodRate.toFixed(6)}% por período nativo`}{" "}
						- {row.complete ? "Histórico completo" : "Histórico insuficiente"};{" "}
						{row.coverageStart ?? "?"} a {row.coverageEnd ?? "?"}
					</p>
				))}
				<p>
					Moedas estrangeiras usam cotação de referência do retrato financeiro. Valorização de renda
					variável não é presumida.
				</p>
				<p>
					Dados atualizados em {snapshot.capturedAt}. Alterações futuras nas taxas, rendas e gastos
					mudam os resultados.
				</p>
			</LoanSection>
			{review && (
				<LoanContractDialog
					initial={review}
					loanId={review.loanId}
					onClose={() => {
						setReview(null);
						setStale(true);
					}}
				/>
			)}
		</div>
	);
}
