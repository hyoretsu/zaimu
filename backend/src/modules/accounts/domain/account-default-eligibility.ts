export function accountDefaultEligibility(type: string, isHidden: boolean) {
	return {
		primary: !isHidden && ["CHECKING", "CASH"].includes(type),
		statements: !isHidden && ["CHECKING", "CASH", "SAVINGS", "INVESTMENT"].includes(type),
	};
}
