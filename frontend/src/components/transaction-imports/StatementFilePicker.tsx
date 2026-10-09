import type { ChangeEvent } from "react";
import { LuFileUp } from "react-icons/lu";
import { inputControlClassName } from "@/components/ui/input-styles";
import { Label } from "@/components/ui/Label";
import { RequiredMark } from "@/components/ui/RequiredMark";

export function StatementFilePicker({
	file,
	inputId = "transaction-import-file",
	label = "Extrato em PDF",
	onFileChange,
}: {
	file: File | null;
	inputId?: string;
	label?: string;
	onFileChange: (file: File | null) => void;
}) {
	const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		onFileChange(event.currentTarget.files?.[0] ?? null);
	};

	return (
		<div className="grid content-start gap-2">
			<Label htmlFor={inputId}>
				<span>
					{label} <RequiredMark />
				</span>
			</Label>
			<input
				accept="application/pdf,.pdf"
				aria-describedby={`${inputId}-description`}
				className="sr-only"
				id={inputId}
				name="statement"
				onChange={handleFileChange}
				required
				type="file"
			/>
			<Label
				className={`${inputControlClassName} cursor-pointer gap-2 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-input/50`}
				htmlFor={inputId}
			>
				<LuFileUp className="shrink-0" />
				<span aria-live="polite" className="min-w-0 flex-1 truncate">
					{file?.name ?? "Selecionar arquivo"}
				</span>
			</Label>
			<p className="text-muted-foreground text-xs" id={`${inputId}-description`}>
				Apenas arquivos PDF.
			</p>
		</div>
	);
}
