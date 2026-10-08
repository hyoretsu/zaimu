let currency = "USD";
export const activeCurrency = () => currency;
export const setActiveCurrency = (value: string) => {
	currency = value;
};
