import { requireUserId } from "~/modules/auth";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
export function assertAdminRole(role: string | undefined) {
	if (role !== "ADMIN") throw new HttpException("Acesso administrativo necessário", 403);
}
export async function requireAdmin(request: Request) {
	const id = await requireUserId(request);
	const [user] = await queryRaw<{ role: string }>(`SELECT "role" FROM "user" WHERE "id"=$1`, [id]);
	assertAdminRole(user?.role);
	return id;
}
