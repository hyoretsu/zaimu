import { Button } from "@/components/ui/Button";
import type { DuplicateField, DuplicateFieldOption, DuplicateSource } from "./types";

interface Props {
	fields: DuplicateFieldOption[];
	isSourceSelected: (source: DuplicateSource) => boolean;
	onSelectAll: (source: DuplicateSource) => void;
	onSelectField: (field: DuplicateField, source: DuplicateSource) => void;
	sources: Partial<Record<DuplicateField, DuplicateSource>>;
	value: (source: DuplicateSource, field: DuplicateField) => string;
}

function SourceButton({
	children,
	selected,
	onClick,
}: {
	children: string;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			aria-pressed={selected}
			className="h-auto min-h-11 w-full min-w-0 cursor-pointer justify-start whitespace-normal break-words rounded-none border-0 px-2 py-2 text-left text-xs leading-5 sm:px-3 sm:py-3 sm:text-sm"
			onClick={onClick}
			type="button"
			variant={selected ? "default" : "outline"}
		>
			{children}
		</Button>
	);
}

export function DuplicateFieldComparison({
	fields,
	isSourceSelected,
	onSelectAll,
	onSelectField,
	sources,
	value,
}: Props) {
	return (
		<div className="overflow-hidden rounded-2xl border">
			<div className="grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] divide-x border-b text-center font-medium text-xs sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
				<span />
				<Button
					aria-pressed={isSourceSelected("imported")}
					className="h-auto min-h-10 w-full cursor-pointer rounded-none border-0 px-2 py-2 text-xs sm:px-4 sm:py-3"
					onClick={() => onSelectAll("imported")}
					type="button"
					variant={isSourceSelected("imported") ? "default" : "outline"}
				>
					Nova
				</Button>
				<Button
					aria-pressed={isSourceSelected("duplicate")}
					className="h-auto min-h-10 w-full cursor-pointer rounded-none border-0 px-2 py-2 text-xs sm:px-4 sm:py-3"
					onClick={() => onSelectAll("duplicate")}
					type="button"
					variant={isSourceSelected("duplicate") ? "default" : "outline"}
				>
					Existente
				</Button>
			</div>
			{fields.map(field => (
				<div
					className="grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] divide-x border-b last:border-0 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]"
					key={field.key}
				>
					<span className="flex items-center break-words px-2 py-2 font-medium text-xs sm:px-4 sm:py-3 sm:text-sm">
						{field.label}
					</span>
					<SourceButton
						onClick={() => onSelectField(field.key, "imported")}
						selected={sources[field.key] === "imported"}
					>
						{value("imported", field.key)}
					</SourceButton>
					<SourceButton
						onClick={() => onSelectField(field.key, "duplicate")}
						selected={sources[field.key] === "duplicate"}
					>
						{value("duplicate", field.key)}
					</SourceButton>
				</div>
			))}
		</div>
	);
}
