import type { ReactNode } from "react";
import { LuCopy, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useDebouncedInput } from "@/hooks/use-debounced-input";

export function OfferCardShell({
	children,
	id,
	kindLabel,
	name,
	onDuplicate,
	onNameChange,
	onRemove,
}: {
	children: ReactNode;
	id: string;
	kindLabel: string;
	name: string;
	onDuplicate?: () => void;
	onNameChange: (name: string) => void;
	onRemove: () => void;
}) {
	const [localName, setLocalName] = useDebouncedInput(name, onNameChange);
	return (
		<section aria-label={name || kindLabel} className="card min-w-0 space-y-4 p-4">
			<div className="flex flex-wrap items-end gap-3">
				<div className="grid min-w-0 flex-1 basis-56 gap-2">
					<Label htmlFor={`${id}-name`}>{kindLabel}</Label>
					<Input
						id={`${id}-name`}
						maxLength={120}
						onChange={event => setLocalName(event.target.value)}
						placeholder="Ex: Banco Azul 24x"
						value={localName}
					/>
				</div>
				<div className="flex gap-2">
					{onDuplicate && (
						<Button
							aria-label="Duplicar oferta"
							onClick={onDuplicate}
							size="icon"
							type="button"
							variant="outline"
						>
							<LuCopy />
						</Button>
					)}
					<Button
						aria-label="Remover oferta"
						onClick={onRemove}
						size="icon"
						type="button"
						variant="outline"
					>
						<LuTrash2 />
					</Button>
				</div>
			</div>
			{children}
		</section>
	);
}
