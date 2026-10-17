import { type TSchema, Type } from "@sinclair/typebox";

/** Describe decoded Elysia values as their JSON response representation. */
export function serializedResponse(schema: TSchema): TSchema {
	const variants = schema.anyOf as TSchema[] | undefined;
	if (variants?.some(value => value.type === "Date")) return Type.String({ format: "date-time" });
	if (variants?.some(value => value.type === "string" && ["numeric", "integer"].includes(value.format))) {
		const numeric = variants.find(value => value.type === "number" || value.type === "integer");
		if (numeric) return serializedResponse(numeric);
	}
	const result = { ...schema };
	if (result.type === "Date") {
		result.type = "string";
		result.format = "date-time";
	}
	for (const [key, value] of Object.entries(result)) {
		if (Array.isArray(value))
			result[key] = value.map(child =>
				child && typeof child === "object" ? serializedResponse(child) : child,
			);
		else if (value && typeof value === "object") {
			if (key === "properties" || key === "$defs" || key === "definitions")
				result[key] = Object.fromEntries(
					Object.entries(value).map(([name, child]) => [name, serializedResponse(child as TSchema)]),
				);
			else result[key] = serializedResponse(value as TSchema);
		}
	}
	return result;
}
