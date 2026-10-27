import { z } from "zod";

export const viewString = z.string().max(2000);
export const viewBoolean = z.boolean();
export const viewNullableId = z.string().max(200).nullable();
export const viewStringList = z.array(z.string().max(200)).max(500);
export const viewDate = z.iso.date();
export const viewDateRange = z
	.object({
		endDate: viewDate.optional(),
		startDate: viewDate.optional(),
	})
	.refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate);
export const viewMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const viewChartPeriod = z
	.object({
		endDate: viewDate,
		periodsAfter: z.number().int().min(0),
		periodsBefore: z.number().int().min(0),
		startDate: viewDate,
	})
	.refine(value => value.startDate <= value.endDate);

/** Explicit field-to-parameter mappings keep object state out of query strings. */
export interface ViewParameter {
	parameter: string;
	path: string;
	optional?: boolean;
}
export const viewDateRangeParameters: ViewParameter[] = [
	{ optional: true, parameter: "startDate", path: "startDate" },
	{ optional: true, parameter: "endDate", path: "endDate" },
];
export const viewChartParameters: ViewParameter[] = [
	{ parameter: "chartStart", path: "startDate" },
	{ parameter: "chartEnd", path: "endDate" },
	{ parameter: "before", path: "periodsBefore" },
	{ parameter: "after", path: "periodsAfter" },
];

function getField(value: unknown, path: string): unknown {
	if (!path) return value;
	return path
		.split(".")
		.reduce<unknown>(
			(current, part) =>
				current && typeof current === "object"
					? (current as Record<string, unknown>)[part]
					: undefined,
			value,
		);
}
function setField(value: unknown, path: string, field: unknown) {
	if (!path) return field;
	const parts = path.split(".");
	let target = value as Record<string, unknown>;
	for (const part of parts.slice(0, -1)) {
		target[part] ??= {};
		target = target[part] as Record<string, unknown>;
	}
	target[parts.at(-1)!] = field;
	return value;
}

export function readViewState<T>(
	href: string,
	key: string,
	fallback: T,
	schema: z.ZodType<T>,
	fields: readonly ViewParameter[] = [],
): T {
	const params = new URL(href, "http://localhost").searchParams;
	let candidate: unknown = structuredClone(fallback);
	const hasFields = fields.some(field => params.has(field.parameter));
	for (const { parameter, path, optional } of fields.length
		? fields
		: [{ optional: false, parameter: key, path: "" }]) {
		const raw = params.get(parameter);
		if (raw === null) {
			if (optional && hasFields) candidate = setField(candidate, path, undefined);
			continue;
		}
		const defaultField = getField(fallback, path);
		const value = Array.isArray(defaultField)
			? params.getAll(parameter)
			: typeof defaultField === "number"
				? raw.trim()
					? Number(raw)
					: Number.NaN
				: typeof defaultField === "boolean"
					? raw === "true"
						? true
						: raw === "false"
							? false
							: raw
					: raw;
		candidate = setField(candidate, path, value);
	}
	const parsed = schema.safeParse(candidate);
	return parsed.success ? parsed.data : fallback;
}

export function writeViewState<T>(
	href: string,
	key: string,
	value: T,
	fallback: T,
	fields: readonly ViewParameter[] = [],
): string {
	const url = new URL(href, "http://localhost");
	for (const { parameter, path } of fields.length ? fields : [{ parameter: key, path: "" }]) {
		const field = getField(value, path);
		const defaultField = getField(fallback, path);
		url.searchParams.delete(parameter);
		const isDefault =
			Array.isArray(field) && Array.isArray(defaultField)
				? field.length === defaultField.length &&
					field.every((item, index) => item === defaultField[index])
				: field === defaultField;
		if (isDefault || field === undefined || field === null || field === "") continue;
		for (const item of Array.isArray(field) ? field : [field]) {
			if (!["string", "number", "boolean"].includes(typeof item))
				throw new Error(`Missing field mapping: ${parameter}`);
			url.searchParams.append(parameter, String(item));
		}
	}
	return `${url.pathname}${url.search}${url.hash}`;
}

/** Router search values stay plain strings, including text that looks like JSON. */
export function parseViewSearch(search: string): Record<string, string | string[]> {
	const params = new URLSearchParams(search);
	const result: Record<string, string | string[]> = Object.create(null);
	for (const key of new Set(params.keys())) {
		const values = params.getAll(key);
		result[key] = values.length === 1 ? values[0]! : values;
	}
	return result;
}
export function stringifyViewSearch(search: Record<string, unknown>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(search)) {
		if (value === undefined || value === null) continue;
		for (const item of Array.isArray(value) ? value : [value]) {
			if (!["string", "number", "boolean"].includes(typeof item))
				throw new Error(`Unsupported search parameter: ${key}`);
			params.append(key, String(item));
		}
	}
	const query = params.toString();
	return query ? `?${query}` : "";
}
