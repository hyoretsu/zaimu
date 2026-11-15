import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { PolicyDraftEditor } from "./PolicyDraftEditor";
import type { ExistingProfile, PolicyDraft } from "./types";

/** Nested modal that edits a single policy draft; saving adds it to the form instead of posting it. */
export function PolicyDraftDialog({
	countries,
	draft,
	initialProfileKey,
	institutionId,
	newProfileNames,
	onOpenChange,
	onSubmit,
	open,
	profiles,
}: {
	countries: string[];
	draft?: PolicyDraft;
	initialProfileKey?: string;
	institutionId?: string;
	newProfileNames: string[];
	onOpenChange: (open: boolean) => void;
	onSubmit: (drafts: Omit<PolicyDraft, "key">[]) => void;
	open: boolean;
	profiles: ExistingProfile[];
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{draft ? "Editar política de rendimento" : "Nova política de rendimento"}
					</DialogTitle>
					<DialogDescription>
						Faixas progressivas aplicadas a contas correntes e poupanças. A política só vale
						quando a sugestão inteira for salva.
					</DialogDescription>
				</DialogHeader>
				{open && (
					<PolicyDraftEditor
						countries={countries}
						draft={draft}
						initialProfileKey={initialProfileKey}
						institutionId={institutionId}
						newProfileNames={newProfileNames}
						onClose={() => onOpenChange(false)}
						onSubmit={onSubmit}
						profiles={profiles}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
