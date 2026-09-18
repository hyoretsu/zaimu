import {
	LuArrowLeftRight,
	LuChartPie,
	LuCreditCard,
	LuLandmark,
	LuLayoutGrid,
	LuRepeat2,
	LuSettings2,
	LuWalletCards,
} from "react-icons/lu";

export const primaryNavigation = [
	{ icon: LuChartPie, label: "Visão geral", to: "/" },
	{ icon: LuArrowLeftRight, label: "Transações", to: "/transactions" },
	{ icon: LuLandmark, label: "Contas", to: "/accounts" },
	{ icon: LuCreditCard, label: "Cartões", to: "/credit-cards" },
	{ icon: LuRepeat2, label: "Recorrências", to: "/recurring" },
	{ icon: LuLayoutGrid, label: "Mais", to: "/more" },
] as const;

export const utilityNavigation = [{ icon: LuSettings2, label: "Ajustes", to: "/settings" }] as const;

export const mobileNavigation = [
	{ ...primaryNavigation[0], tabId: "overview" },
	{ ...primaryNavigation[1], tabId: "transactions" },
	{ ...primaryNavigation[2], tabId: "accounts" },
	{ ...primaryNavigation[3], tabId: "creditCards" },
	{ ...primaryNavigation[5], tabId: "more" },
] as const;

export { LuWalletCards };
