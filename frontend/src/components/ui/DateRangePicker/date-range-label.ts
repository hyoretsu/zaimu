import { endOfMonth, format, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRangeValue } from "./types";

export function formatDateRange({ endDate, startDate }: DateRangeValue) {
	if (startDate && endDate) {
		if (startDate === endDate) return formatBoundary(startDate);
		return (
			formatCompletePeriod(startDate, endDate) ?? `${formatBoundary(startDate)} — ${formatBoundary(endDate)}`
		);
	}
	if (startDate) return `A partir de ${formatBoundary(startDate)}`;
	if (endDate) return `Até ${formatBoundary(endDate)}`;
	return "Todas as datas";
}

function formatCompletePeriod(startDate: string, endDate: string) {
	const start = parseISO(startDate);
	const end = parseISO(endDate);
	if (start.getDate() !== 1 || !isSameDay(end, endOfMonth(end))) return undefined;
	const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
	const now = new Date();
	const isCurrent = start <= now && now <= end;
	if (months === 1) return isCurrent ? "Mês atual" : format(start, "MMMM 'de' yyyy", { locale: ptBR });
	if (months === 3 && start.getMonth() % 3 === 0) {
		const quarter = Math.floor(start.getMonth() / 3) + 1;
		return isCurrent ? "Trimestre atual" : `${quarter}º trimestre de ${start.getFullYear()}`;
	}
	if (months === 6 && (start.getMonth() === 0 || start.getMonth() === 6)) {
		const semester = start.getMonth() === 0 ? 1 : 2;
		return isCurrent ? "Semestre atual" : `${semester}º semestre de ${start.getFullYear()}`;
	}
	if (months === 12 && start.getMonth() === 0) return isCurrent ? "Ano atual" : String(start.getFullYear());
	return undefined;
}

function formatBoundary(value: string) {
	return format(parseISO(value), "dd MMM yyyy", { locale: ptBR });
}
