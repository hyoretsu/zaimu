export function TransactionDateHeader({
	dateLabel,
	endingBalance,
}: {
	dateLabel: string;
	endingBalance: string;
}) {
	return (
		<header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
			<h2 className="font-medium text-muted-foreground text-sm">{dateLabel}</h2>
			<p className="text-end text-muted-foreground text-sm">Saldo final: {endingBalance}</p>
		</header>
	);
}
