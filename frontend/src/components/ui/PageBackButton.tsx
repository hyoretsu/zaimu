import { Link, type LinkProps } from "@tanstack/react-router";
import { LuArrowLeft } from "react-icons/lu";
import { ActionGroup } from "./ActionGroup";
import { Button } from "./Button";

export function PageBackButton({ to }: { to: LinkProps["to"] }) {
	return (
		<ActionGroup className="justify-start">
			<Button asChild size="sm" variant="outline">
				<Link to={to}>
					<LuArrowLeft aria-hidden="true" />
					Voltar
				</Link>
			</Button>
		</ActionGroup>
	);
}
