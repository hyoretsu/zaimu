import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";

const Timing = t.Union([t.Literal("CLOSING_DATE"), t.Literal("DUE_DATE")]);
const PreferenceReturn = t.Object({ invoicePaymentTiming: Timing });
export const InvoicePaymentPreferencesController = new Elysia()
	.get(
		"/invoice-payment-preferences",
		async ({ request }) => {
			const [user] = await queryRaw<{ invoicePaymentTiming: "CLOSING_DATE" | "DUE_DATE" }>(
				'SELECT "invoicePaymentTiming" FROM "user" WHERE "id"=$1',
				[await requireUserId(request)],
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return user;
		},
		{ response: PreferenceReturn },
	)
	.patch(
		"/invoice-payment-preferences",
		async ({ request, body }) => {
			const [user] = await queryRaw<{ invoicePaymentTiming: "CLOSING_DATE" | "DUE_DATE" }>(
				'UPDATE "user" SET "invoicePaymentTiming"=$2 WHERE "id"=$1 RETURNING "invoicePaymentTiming"',
				[await requireUserId(request), body.invoicePaymentTiming],
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return user;
		},
		{ body: PreferenceReturn, response: PreferenceReturn },
	);
