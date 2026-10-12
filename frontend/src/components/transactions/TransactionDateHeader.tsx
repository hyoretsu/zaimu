export function TransactionDateHeader({
	dateLabel,
	endingBalance,
}: {
	dateLabel: string;
	endingBalance?: string;
}) {
	return (
		<header className="flex min-w-0 flex-col items-start gap-1">
			<h2 className="font-medium text-muted-foreground text-sm">{dateLabel}</h2>
			{endingBalance ? <p className="text-muted-foreground text-sm">Saldo final: {endingBalance}</p> : null}
		</header>
	);
}
