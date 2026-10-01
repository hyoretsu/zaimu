import { HttpException } from "~/shared/errors";

export function categoryLookupIds(value: string): string[] {
	if (!value) return [];
	const ids = [...new Set(value.split(","))].sort();
	if (ids.length > 1000 || ids.some(id => !id || id.length > 36))
		throw new HttpException("IDs de categorias inválidos", 400);
	return ids;
}
