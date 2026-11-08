import type { IconType } from "react-icons";
import { LuLandmark, LuLink } from "react-icons/lu";

export type SuggestionType = "INSTITUTION" | "MERGE";

export interface SuggestionTypeInfo {
	description: string;
	icon: IconType;
	label: string;
}

export const SUGGESTION_TYPES: Record<SuggestionType, SuggestionTypeInfo> = {
	INSTITUTION: {
		description:
			"Indique uma instituição nova ou corrija uma existente: nome, países, fechamento de fatura, regras de cartão, perfis e políticas de rendimento em uma única sugestão.",
		icon: LuLandmark,
		label: "Nova ou editar instituição",
	},
	MERGE: {
		description: "Associe uma instituição criada por você a uma já aprovada no catálogo.",
		icon: LuLink,
		label: "Mesclar duplicata",
	},
};
