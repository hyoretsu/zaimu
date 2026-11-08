import { assetSymbol } from "@zaimu/finance/asset-amount";
import { cryptoAsset, cryptoAssets } from "@zaimu/finance/crypto-assets";
import { isCryptoAsset } from "@zaimu/finance/money";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useCurrencyStore } from "@/stores/currency";

export function CurrencySelect({
	allowCrypto = false,
	currencies: allowedCurrencies,
	value,
	onValueChange,
	label = "Moeda",
	disabled = false,
}: {
	allowCrypto?: boolean;
	currencies?: string[];
	value: string;
	onValueChange: (value: string) => void;
	label?: string;
	disabled?: boolean;
}) {
	const currencies = useCurrencyStore(state => state.currencies);
	const names = new Intl.DisplayNames(document.documentElement.lang || "pt-BR", { type: "currency" });
	const codes = allowedCurrencies ?? [
		...new Set([...currencies, ...(allowCrypto ? cryptoAssets.map(asset => asset.code) : [])]),
	];
	const options = codes
		.filter(code => allowCrypto || !isCryptoAsset(code))
		.map(value => {
			const asset = cryptoAsset(value);
			return {
				keywords: [value],
				label: asset
					? `${asset.symbol} - ${asset.name}`
					: `${assetSymbol(value)} - ${isCryptoAsset(value) ? value : (names.of(value) ?? value)}`,
				value,
			};
		});
	return (
		<CustomSelect
			disabled={disabled}
			label={label}
			onValueChange={onValueChange}
			options={options}
			placeholder={allowCrypto ? "Ex: BTC - Bitcoin" : "Ex: US$ - Dólar americano"}
			required
			searchable
			value={value}
		/>
	);
}
