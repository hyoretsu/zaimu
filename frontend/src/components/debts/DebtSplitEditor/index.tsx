import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { NumericField } from "@/components/ui/NumericField";
import type { DebtSplitInput } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import {
	addDebtSplitParticipant,
	calculateDebtSplit,
	compareDebtPersonNames,
	createEqualDebtSplit,
	debtSplitError,
	remainingDebtSplitAmount,
	selectDebtSplitRemainder,
} from "@/lib/debt-split";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { DebtSplitParticipantRow } from "./DebtSplitParticipantRow";
import type { DebtSplitEditorProps } from "./types";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function DebtSplitEditor({
	amount,
	disabled,
	onChange,
	showParticipantDescriptions = true,
	value,
}: DebtSplitEditorProps) {
	const customized = useRef(false);
	const identity = useCacheIdentity();
	const ledger = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.debts.getLedger(),
		queryKey: queryKeys.debts.ledger(identity!),
	});
	const names = new Map(ledger.data?.people.map(person => [person.id, person.name]));
	const sortedParticipants = value.participants
		.map((participant, index) => ({ index, participant }))
		.toSorted((left, right) => {
			const leftName = names.get(left.participant.debtPersonId);
			const rightName = names.get(right.participant.debtPersonId);
			if (!leftName) return rightName ? 1 : left.index - right.index;
			if (!rightName) return -1;
			return compareDebtPersonNames(leftName, rightName) || left.index - right.index;
		});
	const previewRemainderDebtPersonId =
		value.mode !== "SHARES" && value.remainderDebtPersonId
			? `preview-${value.participants.findIndex(
					participant => participant.debtPersonId === value.remainderDebtPersonId,
				)}`
			: undefined;
	const previewValue = {
		...value,
		...(previewRemainderDebtPersonId ? { remainderDebtPersonId: previewRemainderDebtPersonId } : {}),
		participants: value.participants.map((participant, index) => ({
			...participant,
			debtPersonId: `preview-${index}`,
		})),
	} as DebtSplitInput;
	const preview = calculateDebtSplit(amount, previewValue);
	const error = debtSplitError(amount, value);
	const ownerIncluded = value.mode === "SHARES" ? value.ownerShares !== null : value.ownerIncluded;
	const distributed =
		preview?.participants.reduce((sum, participant) => sum + participant.amount, 0) ??
		(value.mode === "FIXED"
			? value.participants.reduce((sum, participant) => sum + participant.fixedAmount, 0)
			: value.mode === "PERCENTAGE"
				? (amount * value.participants.reduce((sum, participant) => sum + participant.percentage, 0)) / 100
				: 0);
	const remaining = remainingDebtSplitAmount(amount, distributed, preview?.ownerAmount ?? 0);
	const updateOwner = (included: boolean) => {
		if (value.mode === "SHARES") onChange({ ...value, ownerShares: included ? 1 : null });
		else onChange({ ...value, ownerIncluded: included });
	};
	const updateParticipant = (
		index: number,
		field: "debtPersonId" | "description" | "value",
		next: string | number,
	) => {
		if (field === "value") {
			if (value.mode !== "SHARES" && value.participants[index].debtPersonId === value.remainderDebtPersonId)
				return;
			customized.current = true;
		}
		const participants = value.participants.map((participant, participantIndex) => {
			if (participantIndex !== index) return participant;
			if (field === "debtPersonId") return { ...participant, debtPersonId: String(next) };
			if (field === "description") return { ...participant, description: String(next) };
			if (value.mode === "SHARES") return { ...participant, shares: Number(next) };
			if (value.mode === "PERCENTAGE") return { ...participant, percentage: Number(next) };
			return { ...participant, fixedAmount: Number(next) };
		});
		const clearsRemainderRecipient =
			value.mode !== "SHARES" &&
			field === "debtPersonId" &&
			value.remainderDebtPersonId === value.participants[index].debtPersonId;
		onChange({
			...value,
			...(clearsRemainderRecipient ? { remainderDebtPersonId: undefined } : {}),
			participants,
		} as DebtSplitInput);
	};
	return (
		<div className="grid min-w-0 max-w-full gap-4 rounded-2xl border p-3 [&>*]:min-w-0">
			<CustomSelect
				label="Forma de divisão"
				onValueChange={mode => {
					customized.current = false;
					onChange(
						createEqualDebtSplit(
							mode as DebtSplitInput["mode"],
							value.participants,
							ownerIncluded,
							amount,
							value.mode === "SHARES" ? undefined : value.remainderDebtPersonId,
						),
					);
				}}
				options={[
					{ label: "Por cotas", value: "SHARES" },
					{ label: "Por porcentagem", value: "PERCENTAGE" },
					{ label: "Por valor", value: "FIXED" },
				]}
				placeholder="Selecione"
				value={value.mode}
			/>
			<p className="text-muted-foreground text-xs">
				Trocar a forma redistribui os valores igualmente.
				{value.mode === "PERCENTAGE" || value.mode === "FIXED"
					? value.remainderDebtPersonId
						? " Valores não distribuídos ficam com a pessoa selecionada."
						: " Valores não distribuídos ficam com você."
					: null}
			</p>
			<CheckboxField
				checkboxProps={{
					checked: ownerIncluded,
					disabled,
					onCheckedChange: checked => updateOwner(checked === true),
				}}
			>
				Incluir minha parte
			</CheckboxField>
			{value.mode === "SHARES" && value.ownerShares !== null ? (
				<NumericField
					decimalScale={0}
					id="debt-split-owner-shares"
					label="Minhas cotas"
					onValueChange={next => {
						customized.current = true;
						onChange({ ...value, ownerShares: Number(next) });
					}}
					placeholder="Ex: 1"
					value={String(value.ownerShares)}
				/>
			) : null}
			{sortedParticipants.map(({ participant, index }) => (
				<DebtSplitParticipantRow
					amount={preview?.participants[index]?.amount}
					disabled={disabled}
					excludedPersonIds={value.participants
						.filter((_, participantIndex) => participantIndex !== index)
						.map(item => item.debtPersonId)
						.filter(Boolean)}
					index={index}
					isRemainderRecipient={
						value.mode !== "SHARES" && value.remainderDebtPersonId === participant.debtPersonId
					}
					key={`${index}-${participant.debtPersonId}`}
					mode={value.mode}
					onDescriptionChange={description => updateParticipant(index, "description", description)}
					onPersonChange={id => updateParticipant(index, "debtPersonId", id)}
					onRemainderRecipientChange={selected => {
						if (value.mode === "SHARES") return;
						customized.current = true;
						onChange(selectDebtSplitRemainder(value, selected ? participant.debtPersonId : undefined));
					}}
					onRemove={() => {
						const participants = value.participants.filter((_, itemIndex) => itemIndex !== index);
						const remainingRemainderDebtPersonId =
							value.mode !== "SHARES" && value.remainderDebtPersonId === participant.debtPersonId
								? undefined
								: value.mode === "SHARES"
									? undefined
									: value.remainderDebtPersonId;
						onChange(
							value.mode === "SHARES" || customized.current
								? ({
										...value,
										...(remainingRemainderDebtPersonId
											? { remainderDebtPersonId: remainingRemainderDebtPersonId }
											: { remainderDebtPersonId: undefined }),
										participants: value.participants.filter((_, itemIndex) => itemIndex !== index),
									} as DebtSplitInput)
								: createEqualDebtSplit(
										value.mode,
										participants,
										ownerIncluded,
										amount,
										remainingRemainderDebtPersonId,
									),
						);
					}}
					onValueChange={next => updateParticipant(index, "value", next)}
					participant={participant}
					showDescription={showParticipantDescriptions}
					totalAmount={amount}
				/>
			))}
			<Button
				className="cursor-pointer"
				disabled={disabled}
				onClick={() => {
					onChange(addDebtSplitParticipant(value));
				}}
				type="button"
				variant="outline"
			>
				<LuPlus /> Adicionar pessoa
			</Button>
			<div className="grid min-w-0 grid-cols-3 gap-2 overflow-hidden rounded-xl bg-muted/50 p-3 text-xs">
				<span className="min-w-0 overflow-hidden">
					Distribuído<strong className="block text-sm">{currency.format(distributed)}</strong>
				</span>
				<span className="min-w-0 overflow-hidden">
					Sua parte<strong className="block text-sm">{currency.format(preview?.ownerAmount ?? 0)}</strong>
				</span>
				<span className="min-w-0 overflow-hidden">
					Restante
					<strong className="block text-sm">{currency.format(remaining)}</strong>
				</span>
			</div>
			{error ? <p className="text-destructive text-xs">{error}</p> : null}
		</div>
	);
}
