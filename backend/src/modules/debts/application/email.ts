import { sendEmail } from "~/modules/auth/email";

const debtsUrl = () => `${(process.env.PUBLIC_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "")}/debts`;

export const sendDebtInvitationEmail = (input: { recipientEmail: string; requesterName: string }) =>
	sendEmail({
		actionLabel: "Ver convite",
		preview: `${input.requesterName} quer compartilhar uma dívida com você. Revise o convite no seu painel Zaimu.`,
		subject: "Você recebeu um convite de dívida",
		to: input.recipientEmail,
		url: debtsUrl(),
	});
