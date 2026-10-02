import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { HttpException } from "~/shared/errors";

/** Elysia otherwise removes unknown fields before validation. Retired contracts must fail. */
export function strictJsonBody(body: unknown, schema: TSchema) {
	if (!Value.Check(schema, body)) throw new HttpException("Corpo da requisição inválido", 422);
	return body;
}

export function rejectLegacyFinancialFields(body: unknown) {
	if (!body || typeof body !== "object") return;
	for (const [key, value] of Object.entries(body)) {
		if (
			[
				"categoryId",
				"categoryName",
				"categoryColor",
				"yieldRate",
				"yieldReferenceRate",
				"cashbackYieldRate",
				"salaryId",
				"salaryOccurrenceDate",
				"subscriptionId",
				"subscriptionOccurrenceDate",
				"recurringPaymentId",
				"legacySource",
				"legacyId",
			].includes(key)
		)
			throw new HttpException("Campo antigo exige conversão de upgrade", 422);
		rejectLegacyFinancialFields(value);
	}
}
