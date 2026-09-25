import nodemailer from "nodemailer";

interface AuthEmail {
	actionLabel: string;
	preview: string;
	subject: string;
	to: string;
	url: string;
}

const publicWebUrl = () => (process.env.PUBLIC_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");

const createTransport = () => {
	if (process.env.NODE_ENV === "test") return nodemailer.createTransport({ jsonTransport: true });

	const host = process.env.SMTP_HOST;
	if (!host) throw new Error("SMTP_HOST is required to send authentication emails");

	return nodemailer.createTransport({
		auth:
			process.env.SMTP_USER && process.env.SMTP_PASSWORD
				? { pass: process.env.SMTP_PASSWORD, user: process.env.SMTP_USER }
				: undefined,
		host,
		port: Number(process.env.SMTP_PORT ?? 587),
		secure: process.env.SMTP_SECURE === "true",
	});
};

const escapeHtml = (value: string) =>
	value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const authEmailHtml = ({ actionLabel, preview, subject, url }: Omit<AuthEmail, "to">) => {
	const appUrl = escapeHtml(publicWebUrl());
	const bannerUrl = `${appUrl}/brand/zaimu-email-banner.png`;
	const safeActionLabel = escapeHtml(actionLabel);
	const safePreview = escapeHtml(preview);
	const safeSubject = escapeHtml(subject);
	const safeUrl = escapeHtml(url);

	return `<!doctype html>
		<html lang="pt-BR">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width,initial-scale=1">
				<title>${safeSubject}</title>
			</head>
			<body style="margin:0;padding:0;background:#F4F3FF;color:#242424;font-family:Figtree,Arial,sans-serif">
				<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${safePreview}</div>
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#F4F3FF">
					<tr>
						<td align="center" style="padding:40px 16px">
							<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #E4E2F4;border-radius:24px;box-shadow:0 16px 48px rgba(79,83,183,.12)">
								<tr>
									<td style="height:8px;background:#4F53B7;border-radius:24px 24px 0 0;font-size:0;line-height:8px">&nbsp;</td>
								</tr>
								<tr>
									<td align="center" style="padding:32px 32px 28px">
										<a href="${appUrl}" style="display:inline-block;text-decoration:none" target="_blank">
											<img src="${bannerUrl}" width="360" alt="Zaimu - the app for finances" style="display:block;width:100%;max-width:360px;height:auto;border:0">
										</a>
									</td>
								</tr>
								<tr>
									<td style="border-top:1px solid #ECEAF7;padding:32px">
										<h1 style="margin:0 0 12px;color:#242424;font-size:28px;line-height:1.25;font-weight:800">${safeSubject}</h1>
										<p style="margin:0;color:#57546B;font-size:16px;line-height:1.65">${safePreview}</p>
										<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px">
											<tr>
												<td bgcolor="#4F53B7" style="border-radius:12px">
													<a href="${safeUrl}" target="_blank" style="display:inline-block;padding:14px 22px;color:#FFFFFF;font-size:15px;font-weight:800;line-height:1;text-decoration:none">${safeActionLabel}</a>
												</td>
											</tr>
										</table>
										<div style="margin-top:28px;padding:16px;background:#FFF8E6;border:1px solid #FFE7A6;border-radius:12px">
											<p style="margin:0 0 6px;color:#6B5A2B;font-size:12px;line-height:1.5;font-weight:700">Se o botão não funcionar, use este endereço:</p>
											<a href="${safeUrl}" target="_blank" style="color:#4F53B7;font-size:12px;line-height:1.5;word-break:break-all">${safeUrl}</a>
										</div>
									</td>
								</tr>
								<tr>
									<td align="center" style="padding:22px 32px;background:#F8F7FC;border-radius:0 0 24px 24px;color:#77748A;font-size:12px;line-height:1.5">
										<strong style="color:#4F53B7">Zaimu</strong> · Seu dinheiro, sem ruído.<br>
										Mensagem automática. Não responda este e-mail.
									</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			</body>
		</html>`;
};

export const sendEmail = async ({ actionLabel, preview, subject, to, url }: AuthEmail) => {
	const from = process.env.SMTP_FROM ?? "Zaimu <nao-responda@zaimu.app>";
	await createTransport().sendMail({
		from,
		html: authEmailHtml({ actionLabel, preview, subject, url }),
		subject,
		text: `${subject}\n\n${preview}\n\n${actionLabel}: ${url}\n\nZaimu · Seu dinheiro, sem ruído.`,
		to,
	});
};

export const verificationUrl = (token: string) =>
	`${publicWebUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;

export const resetPasswordUrl = (token: string) =>
	`${publicWebUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;

export const sendVerificationEmail = (email: string, token: string) =>
	sendEmail({
		actionLabel: "Confirmar e-mail",
		preview: "Confirme seu e-mail para proteger seus dados financeiros e concluir a criação da conta.",
		subject: "Confirme seu e-mail",
		to: email,
		url: verificationUrl(token),
	});

export const sendPasswordResetEmail = (email: string, token: string) =>
	sendEmail({
		actionLabel: "Redefinir senha",
		preview:
			"Recebemos uma solicitação para redefinir sua senha. Ignore esta mensagem caso não tenha sido você.",
		subject: "Redefina sua senha",
		to: email,
		url: resetPasswordUrl(token),
	});
