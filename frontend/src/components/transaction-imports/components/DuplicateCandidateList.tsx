import { Button } from "@/components/ui/Button";
import type { DuplicateCandidate } from "./types";

export function DuplicateCandidateList({
	candidates,
	formatCandidate,
	selectedId,
	onSelect,
}: {
	candidates: DuplicateCandidate[];
	formatCandidate: (candidate: DuplicateCandidate) => string;
	selectedId: string;
	onSelect: (candidate: DuplicateCandidate) => void;
}) {
	return (
		<div className="space-y-2">
			<p className="font-medium text-sm">Duplicatas encontradas ({candidates.length})</p>
			<div className="grid gap-2">
				{candidates.map((candidate, index) => {
					const selected = candidate.id === selectedId;
					return (
						<Button
							aria-pressed={selected}
							className="h-auto min-h-0 w-full cursor-pointer flex-col items-start justify-start whitespace-normal break-words rounded-lg px-3 py-2 text-left leading-5"
							key={`${candidate.source}-${candidate.id}`}
							onClick={() => onSelect(candidate)}
							type="button"
							variant={selected ? "default" : "outline"}
						>
							<span className="whitespace-nowrap font-semibold">Duplicata {index + 1}</span>
							<span className="text-left opacity-85">{formatCandidate(candidate)}</span>
						</Button>
					);
				})}
			</div>
		</div>
	);
}
