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
		<div className="mt-2 font-bold text-3xl">
			<PreferredMoneyAmount error={error} pending={pending} values={values} />
		</div>
	);
}
