import { requireUserId } from "~/modules/auth";
import { HttpException } from "~/shared/errors";
import { db, queryFirst } from "~/shared/infra/sql";
export function assertAdminRole(role: string | undefined) {
	if (role !== "ADMIN") throw new HttpException("Acesso administrativo necessário", 403);
}
export async function requireAdmin(request: Request) {
	const id = await requireUserId(request);
	const user = await queryFirst(
		db.sql.public.user
			.select("role")
			.where((fields, functions) => functions.eq(fields.id, id))
			.limit(1)
			.build(),
	);
	assertAdminRole(user?.role);
	return id;
}
