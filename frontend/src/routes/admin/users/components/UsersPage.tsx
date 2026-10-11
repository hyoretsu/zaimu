import { AdminPageLayout } from "../../components/AdminPageLayout";
import { AdminUsers } from "./AdminUsers";

export function UsersPage() {
	return (
		<AdminPageLayout
			description="Busque usuários por e-mail e gerencie o acesso administrativo."
			title="Usuários"
		>
			<AdminUsers />
		</AdminPageLayout>
	);
}
