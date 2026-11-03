import { CustomSelect } from "@/components/ui/CustomSelect";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FinancialInstitution } from "@/lib/api";
import { institutionOption } from "@/lib/financial-institution";
import { useSuggestionInstitutions } from "./useSuggestionInstitutions";

export function InstitutionPicker({
	filter = () => true,
	label = "Instituição",
	onChange,
	value,
}: {
	filter?: (institution: FinancialInstitution) => boolean;
	label?: string;
	onChange: (institution: FinancialInstitution | undefined) => void;
	value?: string;
}) {
	const institutions = useSuggestionInstitutions();
	if (institutions.isPending) return <Skeleton className="h-16" />;
	if (institutions.isError) return <p role="alert">Não foi possível carregar as instituições.</p>;
	const options = (institutions.data ?? []).filter(filter);
	return (
		<CustomSelect
			label={label}
			onValueChange={id => onChange(options.find(item => item.id === id))}
			options={options.map(institutionOption)}
			placeholder="Ex: Banco Inter"
			required
			searchable
			value={value}
		/>
	);
}
