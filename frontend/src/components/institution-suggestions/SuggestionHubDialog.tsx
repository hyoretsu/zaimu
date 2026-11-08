import { useState } from "react";
import { LuArrowLeft } from "react-icons/lu";
import { INSTITUTION_FORM_RECOVERY_KIND, type InstitutionFormDraft } from "@/components/institution-form";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import { InstitutionSuggestionFlow } from "./InstitutionSuggestionFlow";
import { MergeSuggestionForm } from "./MergeSuggestionForm";
import { SUGGESTION_TYPES, type SuggestionType } from "./suggestion-types";

export function SuggestionHubDialog({
	onOpenChange,
	open,
	types,
}: {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	types: SuggestionType[];
}) {
	const [selected, setSelected] = useState<SuggestionType>();
	const [recovered, setRecovered] = useState<InstitutionFormDraft>();
	useBackgroundModalRecovery<InstitutionFormDraft>(INSTITUTION_FORM_RECOVERY_KIND, entry => {
		setRecovered(entry.payload);
		setSelected("INSTITUTION");
		onOpenChange(true);
	});
	const back = () => {
		setRecovered(undefined);
		setSelected(undefined);
	};
	const close = () => {
		back();
		onOpenChange(false);
	};
	return (
		<Dialog
			onOpenChange={value => {
				if (!value) back();
				onOpenChange(value);
			}}
			open={open}
		>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{selected ? SUGGESTION_TYPES[selected].label : "Sugerir à equipe"}
					</DialogTitle>
					<DialogDescription>
						{selected
							? SUGGESTION_TYPES[selected].description
							: "Escolha o que deseja sugerir. Um admin revisa antes de qualquer mudança valer para todos."}
					</DialogDescription>
				</DialogHeader>
				{selected === "INSTITUTION" ? (
					<InstitutionSuggestionFlow onBack={back} onClose={close} recovered={recovered} />
				) : (
					<DialogBody>
						{selected === "MERGE" ? (
							<div className="grid gap-4">
								<Button
									className="w-fit justify-self-start"
									onClick={back}
									size="sm"
									type="button"
									variant="ghost"
								>
									<LuArrowLeft />
									Voltar
								</Button>
								<MergeSuggestionForm onClose={close} />
							</div>
						) : (
							<ul className="grid gap-2">
								{types.map(type => {
									const info = SUGGESTION_TYPES[type];
									return (
										<li key={type}>
											<button
												className="hover:bg-accent flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left"
												onClick={() => setSelected(type)}
												type="button"
											>
												<info.icon className="mt-1 size-5 shrink-0" />
												<span className="grid gap-0.5">
													<span className="font-semibold">{info.label}</span>
													<span className="text-muted-foreground text-sm">
														{info.description}
													</span>
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						)}
					</DialogBody>
				)}
			</DialogContent>
		</Dialog>
	);
}
