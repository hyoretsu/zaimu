import { useState } from "react";
import { LuArrowLeft } from "react-icons/lu";
import { InstitutionForm, type InstitutionFormDraft } from "@/components/institution-form";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DialogBody } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { institutionOption } from "@/lib/financial-institution";
import { useSuggestionInstitutions } from "./useSuggestionInstitutions";

const NEW_INSTITUTION = "__new__";

/** Picks a new or existing institution, then shows the single complete form in suggestion mode. */
export function InstitutionSuggestionFlow({
	onBack,
	onClose,
	recovered,
}: {
	onBack: () => void;
	onClose: () => void;
	recovered?: InstitutionFormDraft;
}) {
	const institutions = useSuggestionInstitutions();
	const [choice, setChoice] = useState<string | undefined>(
		recovered ? (recovered.institution?.id ?? NEW_INSTITUTION) : undefined,
	);
	const approved = (institutions.data ?? []).filter(item => item.status === "APPROVED");
	const institution =
		choice && choice !== NEW_INSTITUTION
			? (approved.find(item => item.id === choice) ?? recovered?.institution)
			: undefined;
	const header = (
		<div className="grid gap-4">
			<Button
				className="w-fit justify-self-start"
				onClick={onBack}
				size="sm"
				type="button"
				variant="ghost"
			>
				<LuArrowLeft />
				Voltar
			</Button>
			{institutions.isPending ? (
				<Skeleton className="h-16" />
			) : institutions.isError ? (
				<p role="alert">Não foi possível carregar as instituições.</p>
			) : (
				<CustomSelect
					label="Instituição"
					onValueChange={value => setChoice(value || undefined)}
					options={[
						{ label: "Nova instituição", special: true, value: NEW_INSTITUTION },
						...approved.map(institutionOption),
					]}
					placeholder="Ex: Banco Inter"
					required
					searchable
					value={choice}
				/>
			)}
		</div>
	);
	if (!choice || (choice !== NEW_INSTITUTION && !institution)) return <DialogBody>{header}</DialogBody>;
	return (
		<InstitutionForm
			header={header}
			institution={institution}
			key={choice}
			mode="suggest"
			onClose={onClose}
			recovered={
				recovered && (recovered.institution?.id ?? NEW_INSTITUTION) === choice ? recovered : undefined
			}
		/>
	);
}
