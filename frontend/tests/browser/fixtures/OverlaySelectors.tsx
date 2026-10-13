import { useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";

export function OverlaySelectors() {
	const [value, setValue] = useState("a");
	return (
		<>
			<CustomSelect
				label="Categoria"
				onValueChange={setValue}
				options={[
					{ label: "Faturas", value: "a" },
					{ label: "Mercado", value: "b" },
				]}
				placeholder="Escolha categoria"
				searchable
				value={value}
			/>
			<CustomSelect
				label="Moeda"
				onValueChange={setValue}
				options={[
					{ label: "Real", value: "a" },
					{ label: "Dólar", value: "b" },
				]}
				placeholder="Escolha moeda"
				value={value}
			/>
			<DateField id="start" label="Início" name="start" onValueChange={() => undefined} value="2026-09-01" />
		</>
	);
}
