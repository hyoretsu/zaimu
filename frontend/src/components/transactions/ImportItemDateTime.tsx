import { formatLocalDate, formatLocalTime } from "@/lib/date";

export function ImportItemDateTime({
	date,
	originalPurchase = false,
	time,
}: {
	date?: string;
	originalPurchase?: boolean;
	time?: string | null;
}) {
	const formattedTime = formatLocalTime(time);
	if (!date && !formattedTime) return null;

	return (
		<span className="text-muted-foreground text-xs">
			{originalPurchase ? <span className="block">Compra original:</span> : null}
			{date ? formatLocalDate(date) : null}
			{date && formattedTime ? " · " : null}
			{formattedTime}
		</span>
	);
}
