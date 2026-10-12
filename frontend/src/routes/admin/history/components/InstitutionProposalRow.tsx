import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuCheck, LuLink, LuX } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { FormField } from "@/components/ui/FormField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { FinancialInstitution } from "@/lib/api";
import { fetchWithAuth } from "@/lib/dataService";
import { showToast } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import type { InstitutionProposal } from "./InstitutionReviewQueue";
import { MergeProfileResolution, type ProfileResolution } from "./MergeProfileResolution";

const labels: Record<string, string> = {
	APPROVED: "Aprovada",
	ASSOCIATED: "Associada",
	INSTITUTION_UPDATE: "Alteração institucional",
	NEW_INSTITUTION: "Nova instituição",
	PENDING: "Pendente",
	POLICY: "Política de rendimento",
	PROFILE: "Novo perfil",
	REJECTED: "Rejeitada",
};
export function InstitutionProposalRow({
	proposal,
	onReviewed,
}: {
	proposal: InstitutionProposal;
	onReviewed: () => void;
}) {
	const [reason, setReason] = useDebouncedInput("", () => undefined);
	const [target, setTarget] = useState<string>();
	const [resolution, setResolution] = useState<ProfileResolution[]>();
	const [pending, setPending] = useState(false);
	const [confirmed, setConfirmed] = useState(false);
	const userId = useAuthStore(state => state.user?.id);
	const institutions = useQuery({
		enabled: proposal.status === "PENDING",
		queryFn: () => fetchWithAuth<FinancialInstitution[]>("/financial-institutions/"),
		queryKey: ["institutions", userId],
	});
	const current = institutions.data?.find(item => item.id === proposal.institutionId);
	const stale =
		proposal.baseVersion !== null && proposal.version !== null && proposal.baseVersion !== proposal.version;
	const review = (action: string) => {
		setPending(true);
		void fetchWithAuth(`/financial-institutions/review/proposals/${proposal.id}`, {
			body: JSON.stringify({
				action,
				confirmedVersion: confirmed ? proposal.version : undefined,
				profileResolution: resolution,
				reason: reason.trim() || undefined,
				targetId: target,
			}),
			method: "POST",
		})
			.then(() => {
				showToast("Revisão registrada", "positive");
				onReviewed();
			})
			.catch(error => showToast(error.message, "negative"))
			.finally(() => setPending(false));
	};
	return (
		<article className="grid min-w-0 gap-3 rounded-xl border p-4">
			<h3 className="font-semibold">
				{labels[proposal.kind] ?? proposal.kind} -{" "}
				{proposal.name ?? String(proposal.payload.name ?? "Instituição")}
			</h3>
			<p className="text-muted-foreground text-sm">
				{labels[proposal.status] ?? proposal.status} - Autor: {proposal.authorId} - Versão proposta:{" "}
				{proposal.baseVersion ?? "Nova"} - Versão atual: {proposal.version ?? "Nova"}
				{proposal.effectiveDate ? ` - Vigência: ${proposal.effectiveDate.slice(0, 10)}` : ""}
			</p>
			<dl className="grid min-w-0 gap-2 text-sm">
				{Object.entries(proposal.payload).map(([key, value]) => (
					<div className="min-w-0 break-words" key={key}>
						<dt className="font-medium">{key}</dt>
						<dd>
							Atual:{" "}
							{JSON.stringify((current as unknown as Record<string, unknown> | undefined)?.[key]) ??
								"Sem valor"}{" "}
							- Proposto: {JSON.stringify(value)}
						</dd>
					</div>
				))}
			</dl>
			{proposal.reason && <p className="text-sm">Resultado: {proposal.reason}</p>}
			{proposal.status === "PENDING" && (
				<>
					{stale && (
						<div className="rounded-xl border border-destructive p-3 text-sm">
							Versão alterada após proposta. Confira diferenças antes da publicação.
							<Button
								className="mt-2"
								onClick={() => {
									setConfirmed(true);
									showToast("Conferência da versão atual registrada", "info");
								}}
								type="button"
								variant="outline"
							>
								Conferi versão {proposal.version}
							</Button>
						</div>
					)}
					<FormField
						id={`reason-${proposal.id}`}
						label="Motivo da revisão"
						name="review-reason"
						onChange={event => setReason(event.currentTarget.value)}
						placeholder="Ex: Instituição já cadastrada"
						type="text"
						value={reason}
					/>
					<CustomSelect
						label="Associar a instituição aprovada"
						onValueChange={value => {
							setTarget(value);
							setResolution(undefined);
						}}
						options={(institutions.data ?? [])
							.filter(item => item.status === "APPROVED" && item.id !== proposal.institutionId)
							.map(item => ({
								label: `${item.name} - ${(item.operatingCountryCodes ?? []).join(", ")}`,
								value: item.id,
							}))}
						placeholder="Ex: Banco Inter"
						searchable
						value={target}
					/>
					{target && (
						<MergeProfileResolution
							onChange={setResolution}
							proposalId={proposal.id}
							targetId={target}
							value={resolution}
						/>
					)}
					<ActionGroup>
						<Button disabled={pending || !reason.trim()} onClick={() => review("REJECT")} variant="outline">
							<LuX />
							Rejeitar
						</Button>
						<Button
							disabled={pending || !target || (stale && !confirmed)}
							onClick={() => review("ASSOCIATE")}
							variant="outline"
						>
							<LuLink />
							Associar
						</Button>
						<Button disabled={pending || (stale && !confirmed)} onClick={() => review("APPROVE")}>
							<LuCheck />
							Aprovar
						</Button>
					</ActionGroup>
				</>
			)}
		</article>
	);
}
