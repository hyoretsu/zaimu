export function TransactionDateHeader({
	dateLabel,
	endingBalance,
}: {
	dateLabel: string;
	endingBalance?: string;
}) {
	const separatorIndex = dateLabel.indexOf(",");
	const weekdayLabel = separatorIndex === -1 ? dateLabel : dateLabel.slice(0, separatorIndex);
	const remainingDateLabel = separatorIndex === -1 ? "" : dateLabel.slice(separatorIndex);

	return (
		<header className="flex min-w-0 flex-col items-start gap-1">
			<h2 className="font-medium text-muted-foreground text-sm">
				<strong className="font-bold">{weekdayLabel}</strong>
				{remainingDateLabel}
			</h2>
			{endingBalance ? (
				<p className="text-muted-foreground text-sm">
					<strong className="font-bold">Saldo final:</strong> {endingBalance}
				</p>
			) : null}
		</header>
	);
}
