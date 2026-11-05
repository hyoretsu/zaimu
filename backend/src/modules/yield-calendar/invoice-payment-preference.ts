import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { HttpException } from "~/shared/errors";
import { db, queryRows } from "~/shared/infra/sql";

const Timing = t.Union([t.Literal("CLOSING_DATE"), t.Literal("DUE_DATE")]);
const PreferenceReturn = t.Object({ invoicePaymentTiming: Timing });
function presentPreference(user: { invoicePaymentTiming: string }): typeof PreferenceReturn.static {
	if (user.invoicePaymentTiming !== "CLOSING_DATE" && user.invoicePaymentTiming !== "DUE_DATE")
		throw new HttpException("Preferência de pagamento inválida", 500);
	return { invoicePaymentTiming: user.invoicePaymentTiming };
}
export const InvoicePaymentPreferencesController = new Elysia()
	.get(
		"/invoice-payment-preferences",
		async ({ request }) => {
			const userId = await requireUserId(request);
			const [user] = await queryRows(
				db.sql.public.user
					.select("invoicePaymentTiming")
					.where((fields, functions) => functions.eq(fields.id, userId))
					.build(),
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return presentPreference(user);
		},
		{ response: PreferenceReturn },
	)
	.patch(
		"/invoice-payment-preferences",
		async ({ request, body }) => {
			const userId = await requireUserId(request);
			const [user] = await queryRows(
				db.sql.public.user
					.update({ invoicePaymentTiming: body.invoicePaymentTiming })
					.where((fields, functions) => functions.eq(fields.id, userId))
					.returning("invoicePaymentTiming")
					.build(),
			);
			if (!user) throw new HttpException("Usuário indisponível", 404);
			return presentPreference(user);
		},
		{ body: PreferenceReturn, response: PreferenceReturn },
	);
