import { HttpException } from "~/shared/errors";

export function assertInstitutionReview({
	status,
	baseVersion,
	currentVersion,
	confirmedVersion,
	action,
	reason,
}: {
	status: string;
	baseVersion: number | null;
	currentVersion: number;
	confirmedVersion?: number;
	action: string;
	reason?: string;
}) {
	if (status !== "PENDING") throw new HttpException("Proposta já revisada", 409);
	if (baseVersion !== null && baseVersion !== currentVersion && confirmedVersion !== currentVersion)
		throw new HttpException("Versão alterada. Revise as diferenças antes de publicar", 409);
	if (action === "REJECT" && !reason?.trim()) throw new HttpException("Informe o motivo da rejeição", 400);
}
