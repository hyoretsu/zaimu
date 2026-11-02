import { useState } from "react";
import { LuFileUp } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { inputControlClassName } from "@/components/ui/input-styles";
import { Label } from "@/components/ui/Label";
import { RequiredMark } from "@/components/ui/RequiredMark";

export function StatementFilePicker({
	files,
	inputId = "transaction-import-file",
	label = "Extrato em PDF",
	onFilesChange,
	disabled = false,
}: {
	files: File[];
	inputId?: string;
	label?: string;
	onFilesChange: (files: File[]) => void;
	disabled?: boolean;
}) {
	const [error, setError] = useState("");
	const addFiles = (selected: File[]) => {
		if (disabled) return;
		if (
			selected.some(
				file => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"),
			)
		) {
			setError("Selecione apenas arquivos PDF.");
			return;
		}
		setError("");
		onFilesChange([...files, ...selected]);
	};
	return (
		<div
			className="focus-within:ring-ring grid content-start gap-2 focus-within:ring-2"
			onDragOver={event => event.preventDefault()}
			onDrop={event => {
				event.preventDefault();
				addFiles(Array.from(event.dataTransfer.files));
			}}
		>
			<Label asChild id={`${inputId}-label`}>
				<span>
					{label} <RequiredMark />
				</span>
			</Label>
			<input
				accept="application/pdf,.pdf"
				aria-describedby={`${inputId}-description`}
				aria-labelledby={`${inputId}-label`}
				className="sr-only"
				disabled={disabled}
				id={inputId}
				multiple
				name="statement"
				onChange={event => {
					addFiles(Array.from(event.currentTarget.files ?? []));
					event.currentTarget.value = "";
				}}
				type="file"
			/>
			<Label
				className={`${inputControlClassName} hover:bg-input/50 cursor-pointer gap-2`}
				htmlFor={inputId}
			>
				<LuFileUp className="shrink-0" />
				<span>Selecionar arquivos ou arrastar PDFs</span>
			</Label>
			<ul className="grid gap-1">
				{files.map((file, index) => (
					<li className="flex min-w-0 items-center gap-2" key={`${file.name}-${index}`}>
						<span className="min-w-0 flex-1 truncate">{file.name}</span>
						<Button
							aria-label={`Remover ${file.name}`}
							disabled={disabled}
							onClick={() => onFilesChange(files.filter((_, position) => position !== index))}
							type="button"
							variant="ghost"
						>
							Remover
						</Button>
					</li>
				))}
			</ul>
			<p className="text-muted-foreground text-xs" id={`${inputId}-description`}>
				Cada PDF gera uma importação independente.
			</p>
			{error && (
				<p className="text-destructive text-sm" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
