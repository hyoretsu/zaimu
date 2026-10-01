import { HttpException } from "~/shared/errors";

export function requirePendingInvitationRecipient(
	connection: { recipientId: string; status: string } | null | undefined,
	userId: string,
): asserts connection is { recipientId: string; status: string } {
	if (!connection || connection.recipientId !== userId || connection.status !== "PENDING") {
		throw new HttpException("Convite não encontrado", 404);
	}
}
