import { MoneyValue } from "@/components/ui/MoneyValue";
import { PreferredMoneyAmount } from "./PreferredMoneyAmount";

export function NativeMoneyTotals({
	values,
	pending,
	error,
}: {
	values: Array<{ currency: string; amount: number }>;
	pending: boolean;
	error?: boolean;
}) {
	return (
		<MoneyValue className="mt-2 text-3xl sm:text-3xl">
			<PreferredMoneyAmount error={error} pending={pending} values={values} />
		</MoneyValue>
	);
}
