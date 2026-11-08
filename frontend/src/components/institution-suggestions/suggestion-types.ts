import type { IconType } from "react-icons";
import { LuBadgePercent, LuCreditCard, LuLandmark, LuLink, LuPencil, LuUserPlus } from "react-icons/lu";

export type SuggestionType =
	"CARD_RULES" | "EDIT_INSTITUTION" | "MERGE" | "NEW_INSTITUTION" | "POLICY" | "PROFILE";

export interface SuggestionTypeInfo {
	description: string;
	icon: IconType;
	label: string;
}

export const SUGGESTION_TYPES: Record<SuggestionType, SuggestionTypeInfo> = {
	CARD_RULES: {
		description: "Regras de fechamento, vencimento e recompensas de cartão de uma instituição.",
		icon: LuCreditCard,
		label: "Regras de cartão",
	},
	EDIT_INSTITUTION: {
		description:
			"Corrija nome, países de operação ou fechamento de fatura de uma instituição do catálogo.",
		icon: LuPencil,
		label: "Editar instituição",
	},
	MERGE: {
		description: "Associe uma instituição criada por você a uma já aprovada no catálogo.",
		icon: LuLink,
		label: "Mesclar duplicata",
	},
	NEW_INSTITUTION: {
		description: "Indique uma instituição financeira que ainda não existe no catálogo.",
		icon: LuLandmark,
		label: "Nova instituição",
	},
	POLICY: {
		description: "Proponha faixas de rendimento e vigência para uma instituição.",
		icon: LuBadgePercent,
		label: "Política de rendimento",
	},
	PROFILE: {
		description: "Proponha um novo perfil (plano ou categoria de cliente) de uma instituição.",
		icon: LuUserPlus,
		label: "Novo perfil",
	},
};
