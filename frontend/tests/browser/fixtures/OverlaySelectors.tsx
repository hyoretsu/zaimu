import { useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { Input } from "@/components/ui/Input";
import { useDebouncedInput } from "@/hooks/use-debounced-input";

export function OverlaySelectors() {
	const [text, setText] = useDebouncedInput("", () => undefined);
	const [value, setValue] = useState("a");
	const [source, setSource] = useState("CUSTOM");
	return (
		<>
			<Input
				aria-label="Nome"
				name="name"
				onChange={event => setText(event.currentTarget.value)}
				placeholder="Ex: Casa"
				type="text"
				value={text}
			/>
			<CustomSelect
				label="Categoria de planejamento"
				onValueChange={setSource}
				options={[
					{ label: "Faturas", value: "STATEMENTS" },
					{ label: "Etiqueta", value: "TAG" },
					{ label: "Sem categoria", value: "CUSTOM" },
					{ label: "Reserva", value: "RESERVE" },
				]}
				placeholder="Ex: Faturas de cartão"
				value={source}
			/>
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
