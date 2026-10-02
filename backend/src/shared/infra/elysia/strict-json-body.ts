import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { HttpException } from "~/shared/errors";

/** Elysia otherwise removes unknown fields before validation. Retired contracts must fail. */
export function strictJsonBody(body: unknown, schema: TSchema) {
	if (!Value.Check(schema, body)) throw new HttpException("Corpo da requisição inválido", 422);
	return body;
}
