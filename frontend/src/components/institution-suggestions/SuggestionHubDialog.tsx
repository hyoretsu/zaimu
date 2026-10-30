import { type ReactNode, useState } from "react";
import { LuArrowLeft } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { CardRulesSuggestionForm } from "./CardRulesSuggestionForm";
import { MergeSuggestionForm } from "./MergeSuggestionForm";
import { NewInstitutionSuggestionForm } from "./NewInstitutionSuggestionForm";
import { PolicySuggestionForm } from "./PolicySuggestionForm";
import { ProfileSuggestionForm } from "./ProfileSuggestionForm";
import { SUGGESTION_TYPES, type SuggestionType } from "./suggestion-types";

const FORMS: Record<SuggestionType, (props: { onClose: () => void }) => ReactNode> = {
	CARD_RULES: CardRulesSuggestionForm,
	MERGE: MergeSuggestionForm,
	NEW_INSTITUTION: NewInstitutionSuggestionForm,
	POLICY: PolicySuggestionForm,
	PROFILE: ProfileSuggestionForm,
};

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
	const close = () => {
		setSelected(undefined);
		onOpenChange(false);
	};
	const Form = selected ? FORMS[selected] : undefined;
	return (
		<Dialog
			onOpenChange={value => {
				if (!value) setSelected(undefined);
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
				<DialogBody>
					{Form ? (
						<div className="grid gap-4">
							<Button
								className="w-fit justify-self-start"
								onClick={() => setSelected(undefined)}
								size="sm"
								type="button"
								variant="ghost"
							>
								<LuArrowLeft />
								Voltar
							</Button>
							<Form onClose={close} />
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
			</DialogContent>
		</Dialog>
	);
}
